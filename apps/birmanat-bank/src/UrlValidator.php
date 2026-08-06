<?php

declare(strict_types=1);

namespace BirManatBank;

use InvalidArgumentException;

final class UrlValidator
{
    /**
     * @param list<string> $allowedHosts
     */
    public function __construct(private readonly array $allowedHosts)
    {
    }

    public function assertAllowed(string $url, string $field): void
    {
        $parts = parse_url($url);
        if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
            throw new InvalidArgumentException("{$field} must be a valid absolute URL");
        }

        $scheme = strtolower($parts['scheme']);
        if (!in_array($scheme, ['http', 'https'], true)) {
            throw new InvalidArgumentException("{$field} scheme must be http or https");
        }

        $host = strtolower($parts['host']);
        if (!in_array($host, $this->allowedHosts, true)) {
            throw new InvalidArgumentException("{$field} host is not allowed");
        }
    }
}
