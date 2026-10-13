export function canOpenDevice(activeDeviceCount: number, signatureAlreadyActive: boolean) {
  return signatureAlreadyActive || activeDeviceCount < 5;
}
