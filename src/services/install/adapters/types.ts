export interface InstallContext {
  projectDir: string;
  graphhubDir: string;
  home: string;
}

export interface InstallResult {
  client: string;
  installed: boolean;
  reason: string;
  files: string[];
}

export interface ClientAdapter {
  readonly name: string;
  readonly description: string;
  detect(ctx: InstallContext): Promise<boolean>;
  install(ctx: InstallContext): Promise<InstallResult>;
  uninstall(ctx: InstallContext): Promise<InstallResult>;
}
