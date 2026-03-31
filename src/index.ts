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

const app = new Elysia()
  .get("/ping", () => "pong")
  .post("/v2/tx_sign_request", async ({ request, set }) => {
    try {
      console.log("\n====== 收到回调 ======");

      const rawBody = await request.text();
      console.log("rawBody:", rawBody);

      const decoded = jwt.decode(rawBody);
      console.log("解析内容:", decoded);

      if (!decoded || typeof decoded === "string") {
        throw new Error("JWT decode 失败");
      }

      jwt.verify(rawBody, cosignerPubKey);
      console.log("✅ 验签成功");

      const { requestId, assetId, amount } = decoded as TxSignRequestPayload;

      if (!requestId) {
        throw new Error("缺少 requestId");
      }

      let action = "REJECT";
      let rejectionReason = "默认拒绝";

      if (assetId === "ETH" && Number(amount) < 1) {
        action = "APPROVE";
        rejectionReason = "";
      }

      if (assetId === "USDT") {
        action = "APPROVE";
        rejectionReason = "";
      }

      console.log("最终决策:", action);

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
