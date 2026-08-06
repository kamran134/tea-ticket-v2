<?php

declare(strict_types=1);

namespace BirManatBank;

use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use RuntimeException;
use Slim\App as SlimApp;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\StreamFactory;

final class App
{
    public static function create(?Config $config = null): SlimApp
    {
        $config ??= Config::fromEnv();
        $repository = new PaymentRepository($config->sqlitePath);
        $urlValidator = new UrlValidator($config->allowedHosts);
        $webhookClient = new WebhookClient($config->webhookSecret);
        $paymentService = new PaymentService($config, $repository, $urlValidator, $webhookClient);

        $app = AppFactory::create();
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();
        $errorMiddleware = $app->addErrorMiddleware(true, true, true);
        $errorMiddleware->setDefaultErrorHandler(static function (
            Request $request,
            \Throwable $exception,
            bool $displayErrorDetails,
            bool $logErrors,
            bool $logErrorDetails,
        ) use ($app): Response {
            $response = $app->getResponseFactory()->createResponse();
            $status = 500;
            $message = 'Internal server error';

            if ($exception instanceof InvalidArgumentException) {
                $status = 400;
                $message = $exception->getMessage();
            } elseif ($exception instanceof RuntimeException && $exception->getCode() === 404) {
                $status = 404;
                $message = $exception->getMessage();
            } elseif ($exception instanceof RuntimeException && $exception->getCode() === 401) {
                $status = 401;
                $message = $exception->getMessage();
            } elseif ($displayErrorDetails) {
                $message = $exception->getMessage();
            }

            $response->getBody()->write(json_encode([
                'success' => false,
                'error' => $message,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{"success":false}');

            return $response
                ->withStatus($status)
                ->withHeader('Content-Type', 'application/json');
        });

        $requireAuth = static function (Request $request, RequestHandler $handler) use ($config): Response {
            $header = $request->getHeaderLine('Authorization');
            if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
                throw new RuntimeException('Missing bearer token', 401);
            }
            if (!hash_equals($config->apiToken, trim($m[1]))) {
                throw new RuntimeException('Invalid bearer token', 401);
            }

            return $handler->handle($request);
        };

        $app->get('/health', static function (Request $request, Response $response) use ($config): Response {
            $payload = [
                'status' => 'ok',
                'service' => 'BirManatBank',
                'publicUrl' => $config->publicUrl,
            ];
            $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_SLASHES) ?: '{}');

            return $response->withHeader('Content-Type', 'application/json');
        });

        $app->post('/api/v1/payments', static function (Request $request, Response $response) use ($paymentService): Response {
            /** @var array<string, mixed> $body */
            $body = (array) $request->getParsedBody();
            $result = $paymentService->createPayment($body);
            $response->getBody()->write(json_encode([
                'success' => true,
                'data' => $result,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}');

            return $response
                ->withStatus(201)
                ->withHeader('Content-Type', 'application/json');
        })->add($requireAuth);

        $app->get('/api/v1/payments/{paymentId}', static function (Request $request, Response $response, array $args) use ($paymentService): Response {
            $payment = $paymentService->getPayment((string) $args['paymentId']);
            $response->getBody()->write(json_encode([
                'success' => true,
                'data' => $payment,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}');

            return $response->withHeader('Content-Type', 'application/json');
        })->add($requireAuth);

        $app->get('/pay/{token}', static function (Request $request, Response $response, array $args) use ($paymentService, $config): Response {
            $payment = $paymentService->getPaymentByToken((string) $args['token']);
            $html = self::render('payment', [
                'config' => $config,
                'payment' => $payment,
                'error' => null,
                'token' => $args['token'],
            ]);

            $stream = (new StreamFactory())->createStream($html);

            return $response
                ->withBody($stream)
                ->withHeader('Content-Type', 'text/html; charset=utf-8');
        });

        $app->post('/pay/{token}/confirm', static function (Request $request, Response $response, array $args) use ($paymentService, $config): Response {
            $token = (string) $args['token'];
            /** @var array<string, mixed> $body */
            $body = (array) $request->getParsedBody();
            $smsCode = trim((string) ($body['smsCode'] ?? ''));

            try {
                $result = $paymentService->confirmPayment($token, $smsCode);

                return $response
                    ->withStatus(302)
                    ->withHeader('Location', $result['redirectUrl']);
            } catch (InvalidArgumentException $e) {
                $payment = $paymentService->getPaymentByToken($token);
                $html = self::render('payment', [
                    'config' => $config,
                    'payment' => $payment,
                    'error' => $e->getMessage(),
                    'token' => $token,
                ]);
                $stream = (new StreamFactory())->createStream($html);

                return $response
                    ->withStatus(400)
                    ->withBody($stream)
                    ->withHeader('Content-Type', 'text/html; charset=utf-8');
            }
        });

        return $app;
    }

    /**
     * @param array<string, mixed> $vars
     */
    private static function render(string $template, array $vars): string
    {
        extract($vars, EXTR_SKIP);
        ob_start();
        require dirname(__DIR__) . '/templates/' . $template . '.php';

        return (string) ob_get_clean();
    }
}
