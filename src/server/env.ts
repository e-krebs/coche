export interface Env {
  SHOPPING_LIST: DurableObjectNamespace;
  CLERK_SECRET_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  ALLOWED_ORIGINS: string;
  LIST_ID_SECRET: string;
  TICKET_SECRET: string;
  DEV?: string;
}
