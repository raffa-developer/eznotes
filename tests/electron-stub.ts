export const app = {
  getPath: (name: string): string => `${process.cwd()}\\.test-${name}`,
  getVersion: (): string => '0.0.0-test',
  setName: (): void => undefined,
  whenReady: async (): Promise<void> => undefined,
  on: (): void => undefined,
  quit: (): void => undefined
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => false,
  encryptString: (value: string): Buffer => Buffer.from(value, 'utf8'),
  decryptString: (value: Buffer): string => value.toString('utf8')
}

export const shell = {
  openExternal: async (): Promise<void> => undefined,
  showItemInFolder: (): void => undefined,
  openPath: async (): Promise<string> => ''
}

export default { app, safeStorage, shell }
