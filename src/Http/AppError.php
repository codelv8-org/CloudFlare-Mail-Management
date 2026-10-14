<?php
declare(strict_types=1);
namespace Relaydesk\Http;
final class AppError extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly array $codes = []) { parent::__construct($message); }
}
