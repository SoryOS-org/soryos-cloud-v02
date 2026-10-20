import { describe, it, expect } from "vitest";
import { aiProviderRegistry } from "@soryos/provider";
import {
  ZEN_MODELS,
  ZEN_FREE_MODELS,
  ZEN_PAID_MODELS,
  ZEN_DEFAULT_MODEL,
  isZenModelUsable,
} from "@soryos/provider/models-zen";
import { credentialManager, isPublicGatewayKey, PUBLIC_GATEWAY_KEY } from "@soryos/credentials";

describe("catalogue OpenCode Zen", () => {
  it("expose des modèles réels (ids, noms, coûts)", () => {
    expect(ZEN_MODELS.length).toBeGreaterThan(50);
    for (const model of ZEN_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.cost.input).toBeGreaterThanOrEqual(0);
    }
  });

  it("sépare le free tier des modèles payants", () => {
    expect(ZEN_FREE_MODELS.length).toBeGreaterThan(0);
    expect(ZEN_PAID_MODELS.length).toBeGreaterThan(0);
    expect(ZEN_FREE_MODELS.length + ZEN_PAID_MODELS.length).toBe(ZEN_MODELS.length);
    // free ⇔ coût d'entrée nul
    expect(ZEN_FREE_MODELS.every((m) => m.cost.input === 0)).toBe(true);
    expect(ZEN_PAID_MODELS.every((m) => m.cost.input > 0)).toBe(true);
  });

  it("les ids sont uniques", () => {
    const ids = ZEN_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("le modèle par défaut est du free tier (utilisable sans clé)", () => {
    const def = ZEN_MODELS.find((m) => m.id === ZEN_DEFAULT_MODEL);
    expect(def).toBeDefined();
    expect(def!.free).toBe(true);
  });

  it("le provider expose le catalogue Zen", () => {
    const provider = aiProviderRegistry.getRequiredProvider("opencode-zen");
    const models = provider.listModels();
    expect(models.length).toBe(ZEN_MODELS.length);
    expect(provider.getDefaultModel()).toBe(ZEN_DEFAULT_MODEL);
    // L'endpoint est celui de la passerelle d'inférence.
    expect(provider.getEndpoint()).toContain("opencode.ai");
  });
});

describe("clé publique / free tier", () => {
  it("reconnaît la clé publique", () => {
    expect(isPublicGatewayKey(PUBLIC_GATEWAY_KEY)).toBe(true);
    expect(isPublicGatewayKey("")).toBe(true);
    expect(isPublicGatewayKey(undefined)).toBe(true);
    expect(isPublicGatewayKey("sk-vraie-cle")).toBe(false);
  });

  it("la clé publique n'ouvre que les modèles gratuits", () => {
    const free = ZEN_FREE_MODELS[0];
    const paid = ZEN_PAID_MODELS[0];
    expect(isZenModelUsable(free.id, PUBLIC_GATEWAY_KEY)).toBe(true);
    expect(isZenModelUsable(paid.id, PUBLIC_GATEWAY_KEY)).toBe(false);
  });

  it("une clé personnelle ouvre tous les modèles", () => {
    const paid = ZEN_PAID_MODELS[0];
    expect(isZenModelUsable(paid.id, "sk-personnelle")).toBe(true);
  });

  it("le credential manager renvoie la clé publique quand aucune clé n'est configurée", () => {
    const resolved = credentialManager.resolveCredentials("opencode-zen");
    expect(resolved.isConfigured).toBe(true);
    expect(resolved.apiKey).toBe(PUBLIC_GATEWAY_KEY);
    expect(resolved.source).toBe("public_default");
  });
});
