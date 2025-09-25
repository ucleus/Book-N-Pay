declare module "otplib" {
  export const authenticator: {
    options: { window?: number };
    generateSecret(): string;
    keyuri(user: string, service: string, secret: string): string;
    verify(options: { token: string; secret: string }): boolean;
    check(token: string, secret: string): boolean;
  };
}
