export interface IUploader {
  uploadContent(content: FormData, recursive: boolean): Promise<string>;
}
