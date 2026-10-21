// Minimal ambient declaration for the Bun runtime API used in prisma/seed.ts.
// The project runs scripts on Bun (packageManager: bun@1.4.0), so this global
// exists at runtime; this shim only provides the type surface used in code.
// Note: Next.js server code (route handlers, server components, server actions)
// executes on Node.js, so Bun globals must NOT be used there.
declare namespace Bun {
  namespace password {
    function hash(password: string): Promise<string>;
  }
}
