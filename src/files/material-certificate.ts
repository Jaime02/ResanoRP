import path from "node:path";

if (process.env.MATERIAL_CERTIFICATE_ROOT_PATH === undefined) {
  throw new Error("Environment variable MATERIAL_CERTIFICATE_ROOT_PATH is not set");
}

export function getMaterialCertificatePath(materialLotId: number) {
  return path.join(process.env.MATERIAL_CERTIFICATE_ROOT_PATH!, `${materialLotId}.pdf`);
}
