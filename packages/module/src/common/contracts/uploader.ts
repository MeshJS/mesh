export interface IUploader {
  uploadContent(content: FormData, recursive: false): Promise<string>;
}
