import {z} from "zod";

export const CaptureManifestSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal("capture-manifest"),
  id: z.string().min(1).max(64),
  extension: z.enum(["png", "jpg"]),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  sizeBytes: z.number().int().positive().max(6 * 1024 * 1024),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  savedAt: z.iso.datetime({offset: true}),
  source: z.discriminatedUnion("kind", [
    z.object({kind: z.literal("base64")}).strict(),
    z.object({kind: z.literal("page")}).strict(),
    z.object({kind: z.literal("steam-image")}).strict(),
    z.object({
      kind: z.literal("project-file"),
      fileName: z.string().trim().min(1).max(255),
    }).strict(),
  ]),
}).strict().superRefine((value, context) => {
  if (
    (value.extension === "png") !== (value.mimeType === "image/png")
  ) {
    context.addIssue({
      code: "custom",
      path: ["mimeType"],
      message: "capture extension and MIME type must match",
    });
  }
});

export type CaptureManifest = z.infer<typeof CaptureManifestSchema>;

export function parseCaptureManifest(raw: string, expectedId: string): CaptureManifest {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("capture manifest is not valid JSON");
  }
  const manifest = CaptureManifestSchema.parse(decoded);
  if (manifest.id !== expectedId) {
    throw new Error("capture manifest does not match its ID");
  }
  return manifest;
}
