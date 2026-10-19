/**
 * Models — liste les modèles disponibles via @soryos/provider.
 */
import { searchModels } from "@soryos/tool";
import { println, EXIT_OK } from "../framework/ui";

export async function modelsHandler(): Promise<number> {
  const { models } = searchModels(undefined, undefined, { all: true, limit: 500 });
  if (models.length === 0) {
    println("No models found in registry.");
    return EXIT_OK;
  }
  for (const m of models) {
    println(`${m.provider}/${m.id}`);
  }
  return EXIT_OK;
}