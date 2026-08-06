<?php

declare(strict_types=1);

/** @var \BirManatBank\Config $config */
/** @var array<string, mixed> $payment */
/** @var string|null $error */
/** @var string $token */

$amount = htmlspecialchars((string) $payment['amount'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$orderId = htmlspecialchars((string) $payment['order_id'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$description = htmlspecialchars((string) $payment['description'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$status = htmlspecialchars((string) $payment['status'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$cardMask = htmlspecialchars($config->cardMask, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$merchant = htmlspecialchars($config->merchantName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$confirmAction = htmlspecialchars(rtrim($config->publicUrl, '/') . '/pay/' . $token . '/confirm', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$isPaid = $payment['status'] === 'PAID';
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BirManatBank — оплата</title>
    <style>
        :root {
            --bg: #0f172a;
            --card: #1e293b;
            --accent: #f59e0b;
            --text: #f8fafc;
            --muted: #94a3b8;
            --danger: #f87171;
            --ok: #34d399;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            background: radial-gradient(circle at top, #1e3a5f, var(--bg));
            color: var(--text);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }
        .panel {
            width: 100%;
            max-width: 420px;
            background: var(--card);
            border-radius: 16px;
            padding: 28px;
            box-shadow: 0 20px 50px rgba(0,0,0,.35);
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
        }
        .logo {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: linear-gradient(135deg, var(--accent), #ea580c);
            display: grid;
            place-items: center;
            font-weight: 800;
            color: #111;
        }
        h1 { margin: 0; font-size: 1.25rem; }
        .badge {
            display: inline-block;
            margin-top: 8px;
            padding: 4px 8px;
            border-radius: 999px;
            background: rgba(245, 158, 11, .15);
            color: var(--accent);
            font-size: .75rem;
            font-weight: 600;
        }
        .row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid rgba(148,163,184,.2);
            font-size: .95rem;
        }
        .row span:first-child { color: var(--muted); }
        .amount {
            font-size: 1.8rem;
            font-weight: 700;
            margin: 18px 0 8px;
        }
        .amount small { font-size: 1rem; color: var(--muted); font-weight: 500; }
        .card {
            margin: 16px 0;
            padding: 14px;
            border-radius: 12px;
            background: rgba(15,23,42,.55);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            letter-spacing: .08em;
        }
        label {
            display: block;
            margin: 16px 0 8px;
            color: var(--muted);
            font-size: .85rem;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid rgba(148,163,184,.35);
            background: #0b1220;
            color: var(--text);
            font-size: 1.1rem;
            letter-spacing: .3em;
            text-align: center;
        }
        button {
            width: 100%;
            margin-top: 18px;
            padding: 14px;
            border: 0;
            border-radius: 10px;
            background: linear-gradient(135deg, var(--accent), #ea580c);
            color: #111;
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
        }
        button:disabled {
            opacity: .6;
            cursor: not-allowed;
        }
        .hint { margin-top: 10px; color: var(--muted); font-size: .85rem; text-align: center; }
        .error {
            margin-top: 12px;
            padding: 10px 12px;
            border-radius: 8px;
            background: rgba(248,113,113,.12);
            color: var(--danger);
            font-size: .9rem;
        }
        .ok {
            margin-top: 12px;
            padding: 10px 12px;
            border-radius: 8px;
            background: rgba(52,211,153,.12);
            color: var(--ok);
            font-size: .9rem;
        }
    </style>
</head>
<body>
<main class="panel">
    <div class="brand">
        <div class="logo">BM</div>
        <div>
            <h1>BirManatBank</h1>
            <div class="badge">Тестовый режим</div>
        </div>
    </div>

    <div class="amount"><?= $amount ?> <small>AZN</small></div>

    <div class="row"><span>Продавец</span><span><?= $merchant ?></span></div>
    <div class="row"><span>Заказ</span><span><?= $orderId ?></span></div>
    <div class="row"><span>Описание</span><span><?= $description ?></span></div>
    <div class="row"><span>Статус</span><span><?= $status ?></span></div>

    <div class="card"><?= $cardMask ?></div>

    <?php if ($isPaid): ?>
        <div class="ok">Платёж уже оплачен. Можно вернуться в магазин.</div>
        <form method="post" action="<?= $confirmAction ?>">
            <input type="hidden" name="smsCode" value="0000">
            <button type="submit">Вернуться</button>
        </form>
    <?php else: ?>
        <form method="post" action="<?= $confirmAction ?>">
            <label for="smsCode">Код из SMS</label>
            <input id="smsCode" name="smsCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="4" placeholder="••••" required>
            <div class="hint">Тестовый код: <strong>0000</strong></div>
            <?php if ($error): ?>
                <div class="error"><?= htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></div>
            <?php endif; ?>
            <button type="submit">Оплатить</button>
        </form>
    <?php endif; ?>
</main>
</body>
</html>
