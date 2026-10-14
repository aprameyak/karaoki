const MESSAGES: Record<string, string> = {
  quota_exceeded: "You have used all of your processing jobs for this month.",
  job_in_progress: "This song is already being processed.",
  already_processed: "This song has already been processed.",
  upload_missing: "The upload has not finished yet. Try again in a moment.",
  file_too_large: "That file is larger than your plan allows.",
  storage_full: "You have run out of storage space. Delete a song to free some up.",
  unsupported_format: "Upload an MP3, WAV, M4A or FLAC file.",
  unsupported_codec: "That audio encoding is not supported.",
  invalid_audio: "That file is not a readable audio file.",
  too_long: "That song is longer than your plan allows.",
  too_short: "That song is too short to process.",
  rate_limited: "You are going too fast. Wait a moment and try again.",
  queue_unavailable: "Processing is temporarily unavailable. Try again shortly.",
  api_unavailable: "The processing service is unavailable right now.",
  unauthorized: "Your session expired. Log in again.",
};

export function describeError(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}

export async function readApiError(res: Response): Promise<{ code?: string; message: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    const code = body.error?.code;
    return { code, message: describeError(code, body.error?.message ?? "Something went wrong") };
  } catch {
    return { message: "Something went wrong" };
  }
}
