export interface Env {
  ROOM: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: "development" | "production";
}
