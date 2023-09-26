import filedirname from "filedirname";
import path from "path";
import fs from "fs";
import os from "os";
import { Media } from "../media";

export function readResource(fileName: string): Buffer {
  const [__filename, __dirname] = filedirname(import.meta.url);
  return read(path.join(__dirname, "files", fileName));
}

export function writeResource(fileName: string, data: Uint8Array): void {
  const [__filename, __dirname] = filedirname(import.meta.url);
  write(path.join(__dirname, "files", fileName), data);
}

export function writeTempResource(fileName: string, data: Uint8Array): void {
  write(path.join(os.tmpdir(), fileName), data);
}

export function read(path: fs.PathOrFileDescriptor): Buffer {
  return fs.readFileSync(path);
}

export function write(path: fs.PathOrFileDescriptor, data: Uint8Array): void {
  fs.writeFileSync(path, data);
}

export function fileName(media: Media): string {
  return `${media.name}.${media.mimeType.split("/")[1]}`;
}
