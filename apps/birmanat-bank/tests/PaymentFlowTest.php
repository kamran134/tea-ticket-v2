<?php

declare(strict_types=1);

namespace BirManatBank\Tests;

use BirManatBank\App;
use BirManatBank\Config;
use BirManatBank\PaymentRepository;
use BirManatBank\PaymentService;
use BirManatBank\UrlValidator;
use BirManatBank\WebhookClient;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class PaymentFlowTest extends TestCase
{
    private string $sqlitePath;

    private Config $config;

    private FakeWebhookClient $webhookClient;

    private PaymentService $service;

    protected function setUp(): void
    {
        $this->sqlitePath = sys_get_temp_dir() . '/birmanat-bank-test-' . uniqid('', true) . '.sqlite';
        $this->config = new Config(
            publicUrl: 'http://localhost:8082',
            apiToken: 'test-token',
            webhookSecret: 'test-webhook-secret',
            allowedHosts: ['localhost', '127.0.0.1', 'backend', 'tickets.birmanat.band'],
            sqlitePath: $this->sqlitePath,
        );
        $this->webhookClient = new FakeWebhookClient($this->config->webhookSecret);
        $this->service = new PaymentService(
            $this->config,
            new PaymentRepository($this->sqlitePath),
            new UrlValidator($this->config->allowedHosts),
            $this->webhookClient,
        );
    }

    protected function tearDown(): void
    {
        if (is_file($this->sqlitePath)) {
            unlink($this->sqlitePath);
        }
    }

    public function testCreateRequiresBearerToken(): void
    {
        putenv('BIRMANAT_BANK_PUBLIC_URL=http://localhost:8082');
        putenv('BIRMANAT_BANK_API_TOKEN=test-token');
        putenv('BIRMANAT_BANK_WEBHOOK_SECRET=test-webhook-secret');
        putenv('BIRMANAT_BANK_ALLOWED_HOSTS=localhost,127.0.0.1,backend');
        putenv('BIRMANAT_BANK_SQLITE_PATH=' . $this->sqlitePath);

        $app = App::create($this->config);
        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/v1/payments')
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody($this->validCreatePayload());

        $response = $app->handle($request);
        $this->assertSame(401, $response->getStatusCode());
    }

    public function testCreatePaymentSuccess(): void
    {
        $result = $this->service->createPayment($this->validCreatePayload());

        $this->assertStringStartsWith('bmp_', $result['paymentId']);
        $this->assertSame('CREATED', $result['status']);
        $this->assertStringContainsString('/pay/', $result['paymentUrl']);
    }

    public function testRejectsNonAznCurrency(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('currency must be AZN');

        $payload = $this->validCreatePayload();
        $payload['currency'] = 'USD';
        $this->service->createPayment($payload);
    }

    public function testRejectsInvalidAmountFormat(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('amount must match');

        $payload = $this->validCreatePayload();
        $payload['amount'] = '25.00';
        $this->service->createPayment($payload);
    }

    public function testRejectsDisallowedWebhookHost(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('webhookUrl host is not allowed');

        $payload = $this->validCreatePayload();
        $payload['webhookUrl'] = 'https://evil.example/hook';
        $this->service->createPayment($payload);
    }

    public function testConfirmWithCorrectSmsCode(): void
    {
        $created = $this->service->createPayment($this->validCreatePayload());
        $token = basename(parse_url($created['paymentUrl'], PHP_URL_PATH) ?: '');

        $result = $this->service->confirmPayment($token, '0000');

        $this->assertFalse($result['alreadyPaid']);
        $this->assertSame('PAID', $result['payment']['status']);
        $this->assertStringContainsString('paymentId=', $result['redirectUrl']);
        $this->assertCount(1, $this->webhookClient->calls);
        $this->assertSame('payment.succeeded', $this->webhookClient->calls[0]['payload']['event']);
    }

    public function testConfirmWithWrongSmsCode(): void
    {
        $created = $this->service->createPayment($this->validCreatePayload());
        $token = basename(parse_url($created['paymentUrl'], PHP_URL_PATH) ?: '');

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid SMS code');
        $this->service->confirmPayment($token, '1234');
    }

    public function testConfirmIsIdempotent(): void
    {
        $created = $this->service->createPayment($this->validCreatePayload());
        $token = basename(parse_url($created['paymentUrl'], PHP_URL_PATH) ?: '');

        $this->service->confirmPayment($token, '0000');
        $second = $this->service->confirmPayment($token, '0000');

        $this->assertTrue($second['alreadyPaid']);
        $this->assertCount(1, $this->webhookClient->calls);
    }

    public function testWebhookHmacSignature(): void
    {
        $client = new WebhookClient('test-webhook-secret');
        $body = '{"eventId":"bme_1","status":"PAID"}';
        $expected = hash_hmac('sha256', $body, 'test-webhook-secret');

        $this->assertSame($expected, $client->sign($body));
    }

    public function testHttpCreateAndGetStatus(): void
    {
        $app = App::create($this->config);
        $createRequest = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/v1/payments')
            ->withHeader('Authorization', 'Bearer test-token')
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody($this->validCreatePayload());

        $createResponse = $app->handle($createRequest);
        $this->assertSame(201, $createResponse->getStatusCode());
        $createBody = json_decode((string) $createResponse->getBody(), true);
        $this->assertTrue($createBody['success']);
        $paymentId = $createBody['data']['paymentId'];

        $getRequest = (new ServerRequestFactory())
            ->createServerRequest('GET', '/api/v1/payments/' . $paymentId)
            ->withHeader('Authorization', 'Bearer test-token');
        $getResponse = $app->handle($getRequest);
        $getBody = json_decode((string) $getResponse->getBody(), true);

        $this->assertSame(200, $getResponse->getStatusCode());
        $this->assertSame('CREATED', $getBody['data']['status']);
        $this->assertSame('25.0000', $getBody['data']['amount']);
        $this->assertSame('AZN', $getBody['data']['currency']);
    }

    /**
     * @return array<string, string>
     */
    private function validCreatePayload(): array
    {
        return [
            'orderId' => 'checkout-1',
            'amount' => '25.0000',
            'currency' => 'AZN',
            'description' => 'Tea Ticket',
            'returnUrl' => 'http://localhost:8080/ticket?id=1',
            'webhookUrl' => 'http://backend:3000/api/webhooks/payments/birmanat-bank',
        ];
    }
}
