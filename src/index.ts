import { Elysia } from "elysia";
import fs from "fs";
import jwt, { type JwtPayload } from "jsonwebtoken";

type TxSignRequestPayload = JwtPayload & {
  requestId?: string;
  assetId?: string;
  amount?: string | number;
};

const privateKey = fs.readFileSync(
  new URL("../callback_private.pem", import.meta.url)
);
const cosignerPubKey = fs.readFileSync(
  new URL("../cosigner_public.pem", import.meta.url)
);

const ALLOWED_SOURCES = [
  {
    sourceType: "VAULT",
    sourceId: "94",
  },
] as const;

const app = new Elysia()
  .get("/ping", () => "pong")
  .post("/v2/tx_sign_request", async ({ request, set }) => {
    try {
      console.log("\n====== 收到回调 ======");

      const rawBody = await request.text();

      const decoded = jwt.decode(rawBody);
      console.log("解析内容:", decoded);

      if (!decoded || typeof decoded === "string") {
        throw new Error("JWT decode 失败");
      }

      jwt.verify(rawBody, cosignerPubKey);
      console.log("✅ 验签成功");

      const { requestId, sourceType, sourceId, note } = decoded as TxSignRequestPayload;

      if (!requestId) {
        throw new Error("缺少 requestId");
      }

      let action = "REJECT";
      let rejectionReason = "默认拒绝";

      if (ALLOWED_SOURCES.some((source) => source.sourceType === sourceType && source.sourceId === sourceId)) {
        action = "APPROVE";
        rejectionReason = "支持的来源";
      } else {
        rejectionReason = "不支持的来源";
      }

      if (note === "1") {
        action = "APPROVE";
        rejectionReason = "note 为 1 时批准";
      } else {
        rejectionReason = "note 为 0 时拒绝";
      }

      console.log("最终决策:", action);
      console.log("最终原因:", rejectionReason);

      const signedRes = jwt.sign(
        {
          action,
          requestId,
          rejectionReason,
        },
        privateKey,
        { algorithm: "RS256" }
      );

      return signedRes;
    } catch (error) {
      console.error("❌ 错误:", error);
      set.status = 401;
      return "Unauthorized";
    }
  })
  .listen(3000);

console.log(`🚀 server running on port ${app.server?.port}`);
