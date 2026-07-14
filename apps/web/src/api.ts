export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join(". ")
        : (body.message ?? "Une erreur est survenue"),
    );
  }

  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
