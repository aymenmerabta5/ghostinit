/** Paddle's published v2 loader uses these production/sandbox hosts. */
export function paddleCheckoutContentSecurityPolicy(base: string): string {
  return base
    .replace(
      "script-src 'self'",
      "script-src 'self' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
    )
    .replace(
      "connect-src 'self'",
      "connect-src 'self' https://api.paddle.com https://sandbox-api.paddle.com https://create-checkout.paddle.com https://sandbox-create-checkout.paddle.com https://cdn.paddle.com https://sandbox-cdn.paddle.com",
    )
    .replace(
      "img-src 'self'",
      "img-src 'self' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
    )
    .replace(
      "object-src 'none'",
      "frame-src https://buy.paddle.com https://sandbox-buy.paddle.com; object-src 'none'",
    );
}

export function paddleCheckoutPolicyDeclaration(): string {
  return `const paddleCheckoutContentSecurityPolicy: (base: string) => string = ${paddleCheckoutContentSecurityPolicy.toString()};`;
}
