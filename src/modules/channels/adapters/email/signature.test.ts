import { describe, it, expect } from "vitest";
import {
  anySvixSignatureMatches,
  decodeSvixSecret,
  parseSvixSignatureHeader,
  parseSvixTimestamp,
  signSvixWebhook,
  svixSignaturesMatch,
} from "@/modules/channels/adapters/email/signature";

const KEY = Buffer.from("0123456789abcdefghijklmn");
const SECRET = `whsec_${KEY.toString("base64")}`;
const RAW_BODY = '{"type":"email.received"}';
const MSG_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TIMESTAMP = "1710000000";

describe("Email Svix signature", () => {
  it("decodes a whsec_ secret and signs id.timestamp.rawBody", () => {
    const key = decodeSvixSecret(SECRET);
    expect(key?.equals(KEY)).toBe(true);
    const expected = signSvixWebhook(KEY, MSG_ID, TIMESTAMP, RAW_BODY);
    expect(expected.length).toBeGreaterThan(0);
    expect(svixSignaturesMatch(expected, expected)).toBe(true);
  });

  it("rejects empty, missing prefix, and invalid secrets", () => {
    expect(decodeSvixSecret("")).toBeNull();
    expect(decodeSvixSecret("c".repeat(32))).toBeNull();
    expect(decodeSvixSecret("whsec_")).toBeNull();
  });

  it("parses v1 signatures and ignores malformed prefixes", () => {
    const digest = signSvixWebhook(KEY, MSG_ID, TIMESTAMP, RAW_BODY);
    expect(parseSvixSignatureHeader(`v1,${digest}`)).toEqual([digest]);
    expect(parseSvixSignatureHeader(`v1,${digest} v1,other`)).toEqual([
      digest,
      "other",
    ]);
    expect(parseSvixSignatureHeader(null)).toEqual([]);
    expect(parseSvixSignatureHeader("sha256=abcd")).toEqual([]);
    expect(parseSvixSignatureHeader("v1,")).toEqual([]);
  });

  it("accepts any matching v1 signature in the header", () => {
    const digest = signSvixWebhook(KEY, MSG_ID, TIMESTAMP, RAW_BODY);
    expect(anySvixSignatureMatches(digest, ["nope", digest])).toBe(true);
    expect(anySvixSignatureMatches(digest, ["nope"])).toBe(false);
  });

  it("verifies the raw body, not reformatted JSON", () => {
    const signed = signSvixWebhook(KEY, MSG_ID, TIMESTAMP, RAW_BODY);
    const reformatted = JSON.stringify(JSON.parse(RAW_BODY), null, 2);
    const expectedForReformatted = signSvixWebhook(
      KEY,
      MSG_ID,
      TIMESTAMP,
      reformatted
    );
    expect(svixSignaturesMatch(signed, expectedForReformatted)).toBe(false);
  });

  it("rejects timestamps outside the 5-minute Svix window", () => {
    const now = Number(TIMESTAMP) * 1000;
    expect(parseSvixTimestamp(TIMESTAMP, now)).toBe(TIMESTAMP);
    expect(parseSvixTimestamp(String(Number(TIMESTAMP) - 301), now)).toBeNull();
    expect(parseSvixTimestamp(String(Number(TIMESTAMP) + 301), now)).toBeNull();
    expect(parseSvixTimestamp("not-a-time", now)).toBeNull();
    expect(parseSvixTimestamp("1710000000000", now)).toBeNull();
  });
});
