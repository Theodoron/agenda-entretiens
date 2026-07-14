export function requiredSecret(name: string, environment: NodeJS.ProcessEnv = process.env, minimumLength = 32) {
  const value = environment[name];
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} doit contenir au moins ${minimumLength} caractères`);
  }
  return value;
}
