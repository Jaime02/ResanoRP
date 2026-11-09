// Without a type, the browser sniffs the text and may download it instead of showing it
export function textResponse(message: string, status: number) {
  return new Response(message, { headers: { "Content-Type": "text/plain; charset=utf-8" }, status });
}
