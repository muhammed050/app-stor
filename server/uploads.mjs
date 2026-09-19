import {imageMetadata} from "../shared/listing.mjs";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { once } from "node:events";
import { db, atomic, id, save, record } from "./db.mjs";
import { fail, text } from "./domain.mjs";
import { limit } from "./auth.mjs";
export const chunkSize = 2 * 1024 * 1024;
export async function beginUpload(user, body) {
  await limit(`upload:${user.id}`, 80, 3600000);
  const name = text(body.name, 1, 150);
  const ext = extname(name).toLowerCase();
  if (
    !["app", "receipt", "listing"].includes(body.kind) ||
    !(
      body.kind === "app" ? [".apk", ".aab"] : body.kind === "listing" ? [".png", ".jpg", ".jpeg"] : [".pdf", ".png", ".jpg", ".jpeg"]
    ).includes(ext)
  )
    fail("نوع ملف غير مسموح");
  if (
    !Number.isInteger(body.size) ||
    body.size <= 0 ||
    body.size > (body.kind === "app" ? 128 : 10) * 1024 * 1024
  )
    fail("حجم الملف غير مسموح", 413);
  return atomic(async () => {
    await db
      .prepare("DELETE FROM uploads WHERE NOT completed AND expires<?")
      .run(Date.now());
    const count = await db
      .prepare(
        "SELECT count(*) AS count FROM uploads WHERE owner=? AND NOT completed",
      )
      .get(user.id);
    if (Number(count.count) >= 5)
      fail("أكمل الملفات المعلقة أو أعد المحاولة لاحقًا", 429);
    const key = id();
    await db
      .prepare(
        "INSERT INTO uploads(id,owner,name,kind,size,expires) VALUES(?,?,?,?,?,?)",
      )
      .run(key, user.id, name, body.kind, body.size, Date.now() + 86400000);
    return { id: key, chunkSize };
  });
}
async function ownUpload(user, key) {
  const upload = await db
    .prepare("SELECT * FROM uploads WHERE id=? AND owner=?")
    .get(key, user.id);
  if (!upload) fail("ملف غير موجود", 404);
  if (!upload.completed && Number(upload.expires) < Date.now())
    fail("انتهت مهلة الرفع", 410);
  return upload;
}
export async function uploadPart(req, user, key, index) {
  if (!/^\d+$/.test(index)) fail("جزء غير صالح");
  const part = Number(index);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > chunkSize) fail("جزء الملف كبير جدًا", 413);
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);
  return atomic(async () => {
    const upload = await ownUpload(user, key);
    if (upload.completed) fail("الرفع مكتمل", 409);
    const expected = Math.min(chunkSize, upload.size - part * chunkSize);
    if (
      part < 0 ||
      part >= Math.ceil(upload.size / chunkSize) ||
      size !== expected
    )
      fail("حجم جزء الملف غير مطابق");
    const existing = await db
      .prepare("SELECT content FROM upload_parts WHERE upload_id=? AND part=?")
      .get(key, part);
    if (existing) {
      if (!Buffer.from(existing.content).equals(content))
        fail("جزء مختلف بنفس الرقم", 409);
      return { ok: true };
    }
    await db
      .prepare("INSERT INTO upload_parts VALUES(?,?,?)")
      .run(key, part, content);
    return { ok: true };
  });
}
function validHeader(bytes, upload) {
  const ext = extname(upload.name).toLowerCase();
  if (upload.kind === "app")
    return bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));
  if (ext === ".pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  if (ext === ".png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes[0] === 255 && bytes[1] === 216;
}
export async function finishUpload(user, key) {
  return atomic(async () => {
    const upload = await ownUpload(user, key);
    if (upload.completed) return record(key);
    const imageParts = [];
    const hash = createHash("sha256");
    let size = 0;
    for (let part = 0; part < Math.ceil(upload.size / chunkSize); part++) {
      const row = await db
        .prepare(
          "SELECT content FROM upload_parts WHERE upload_id=? AND part=?",
        )
        .get(key, part);
      if (!row) fail("الملف لم يكتمل");
      const content = Buffer.from(row.content);
      if (part === 0 && !validHeader(content, upload))
        fail("محتوى الملف لا يطابق نوعه");
      if(upload.kind === "listing") imageParts.push(content);
      hash.update(content);
      size += content.length;
    }
    if (size !== upload.size) fail("حجم الملف غير مطابق");
    let image;
    if(upload.kind === "listing") {try {image=imageMetadata(Buffer.concat(imageParts));} catch(e){fail(e.message);} }
    const file = await save("file", {
      id: key,
      owner: user.id,
      name: upload.name,
      kind: upload.kind,
      size,
      sha256: hash.digest("hex"),
      storage: "postgres",
      ...(image ? {image} : {}),
    });
    await db.prepare("UPDATE uploads SET completed=true WHERE id=?").run(key);
    return file;
  });
}
export async function streamUpload(res, file) {
  for (let part = 0; part < Math.ceil(file.size / chunkSize); part++) {
    if (res.destroyed) return;
    const row = await db
      .prepare("SELECT content FROM upload_parts WHERE upload_id=? AND part=?")
      .get(file.id, part);
    if (!row) throw new Error("Missing stored file part");
    if (!res.write(Buffer.from(row.content))) await once(res, "drain");
  }
  res.end();
}
