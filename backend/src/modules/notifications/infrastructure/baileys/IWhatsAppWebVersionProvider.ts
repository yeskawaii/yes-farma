export interface IWhatsAppWebVersionProvider {
  getCurrentVersion(): Promise<[number, number, number]>;
}
