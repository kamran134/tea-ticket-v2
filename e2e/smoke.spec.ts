import { expect, test } from '@playwright/test';

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000';

test.describe('purchase smoke', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${backendUrl}/api/test/reset`);
    expect(res.ok()).toBeTruthy();
  });

  test('happy path: seated purchase, mock payment success, QR confirmed', async ({ page, request }) => {
    const seed = await (await request.post(`${backendUrl}/api/test/seed`)).json();
    const slug = seed.data.slug as string;

    await page.goto('/');
    await page.getByTestId('event-open').first().click();
    await expect(page).toHaveURL(new RegExp(`/e/${slug}`));

    await page.getByRole('button', { name: /мест|seats|yer/i }).click();
    await page.getByTestId('seat-TEST-SEAT-1').click();
    await page.getByRole('button', { name: /Готово|Done|Hazırdır|Купить|Buy|Al/i }).first().click();

    await page.getByTestId('register-name').fill('Test User');
    await page.getByTestId('register-phone').fill('+994501234567');
    await page.getByTestId('register-email').fill('test@example.com');
    await page.getByTestId('register-submit').click();

    await page.getByTestId('payment-button').click();
    await page.getByTestId('mock-payment-success').click();

    await expect(page.getByTestId('ticket-status')).toHaveAttribute('data-ticket-status', 'CONFIRMED');
    await expect(page.getByTestId('ticket-qr')).toBeVisible();
  });

  test('general zone purchase', async ({ page, request }) => {
    await request.post(`${backendUrl}/api/test/seed`);
    await page.goto('/e/qa-test-event');
    await page.getByRole('button', { name: /мест|seats|yer/i }).click();
    const general = page.locator('[title*="QA General"]').first();
    await general.click();
    await page.getByTestId('quantity-plus').click();
    await page.getByTestId('quantity-confirm').click();
    await page.getByRole('button', { name: /Готово|Done|Hazırdır/i }).first().click();
    await page.getByTestId('register-name').fill('General User');
    await page.getByTestId('register-phone').fill('+994501234567');
    await page.getByTestId('register-email').fill('general@example.com');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('payment-button')).toBeVisible();
  });

  test('payment failure leaves ticket booked', async ({ page, request }) => {
    await request.post(`${backendUrl}/api/test/seed`);
    await page.goto('/e/qa-test-event');
    await page.getByRole('button', { name: /мест|seats|yer/i }).click();
    await page.getByTestId('seat-TEST-SEAT-2').click();
    await page.getByRole('button', { name: /Готово|Done|Hazırdır|Купить|Buy|Al/i }).first().click();
    await page.getByTestId('register-name').fill('Fail User');
    await page.getByTestId('register-phone').fill('+994501234567');
    await page.getByTestId('register-email').fill('fail@example.com');
    await page.getByTestId('register-submit').click();
    await page.getByTestId('payment-button').click();
    await page.getByTestId('mock-payment-failure').click();
    await expect(page.getByTestId('ticket-status')).toHaveAttribute('data-ticket-status', 'BOOKED');
  });

  test('individual table seats go to the cart separately', async ({ page, request }) => {
    await request.post(`${backendUrl}/api/test/seed`);
    await page.goto('/e/qa-test-event');
    await page.getByRole('button', { name: /мест|seats|yer/i }).click();
    await page.getByTestId('seat-TEST-TABLE-SEAT-2').click();
    await page.getByTestId('seat-TEST-TABLE-SEAT-3').click();
    await expect(page.getByTestId('map-selection')).toBeVisible();
    await page.getByRole('button', { name: /Готово|Done|Hazırdır|Купить|Buy|Al/i }).first().click();
    await expect(page.getByTestId('cart-item')).toHaveCount(2);
    await expect(page.getByTestId('cart')).toContainText(/стол|table|masa/i);
    await page.getByTestId('register-name').fill('Table User');
    await page.getByTestId('register-phone').fill('+994501234567');
    await page.getByTestId('register-email').fill('table@example.com');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('payment-button')).toBeVisible();
  });
});
