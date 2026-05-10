export type AppEntityAdapter = {
  list: (...args: any[]) => Promise<any[]>;
  filter: (...args: any[]) => Promise<any[]>;
  create: (data: any) => Promise<any>;
  update: (id: string, data: any) => Promise<any>;
  delete: (id: string) => Promise<any>;
  subscribe: (handler: (event: any) => void) => () => void;
};

export type AppApi = {
  auth: {
    me: () => Promise<any>;
    logout: (...args: any[]) => Promise<any>;
    redirectToLogin: (...args: any[]) => Promise<any>;
    loginWithCredentials: (
      email: string,
      password: string,
      redirectUri?: string
    ) => Promise<any>;
    updateMe: (data: any) => Promise<any>;
    setAccessToken: (token: string) => Promise<any>;
    switchOrganization: (organizationId: string) => Promise<any>;
  };
  users: {
    invite: (...args: any[]) => Promise<any>;
  };
  organizations: {
    list: () => Promise<any[]>;
    ownerOverview: () => Promise<any>;
    current: () => Promise<any>;
    create: (payload: any) => Promise<any>;
    createUser: (organizationId: string, payload: any) => Promise<any>;
    deleteUser: (organizationId: string, userId: string) => Promise<any>;
    pauseLicense: (organizationId: string) => Promise<any>;
    activateLicense: (organizationId: string) => Promise<any>;
    listPlans: () => Promise<any[]>;
    switch: (organizationId: string) => Promise<any>;
    hardDeleteOrganization: (organizationId: string) => Promise<any>;
  };
  entities: Record<string, AppEntityAdapter>;
  files: {
    uploadPublic: (payload: any) => Promise<any>;
    uploadPrivate: (payload: any) => Promise<any>;
    createSignedUrl: (payload: any) => Promise<any>;
  };
  ai: {
    invoke: (payload: any) => Promise<any>;
  };
  email: {
    getSettings: () => Promise<any>;
    updateSettings: (payload: any) => Promise<any>;
    sendTest: (payload?: any) => Promise<any>;
  };
  business: {
    sendInterventionClientEmail: (interventionId: string) => Promise<any>;
    notifyMaterialRequestApprovers: (requestId: string) => Promise<any>;
  };
  functions: {
    invoke: (name: string, payload?: any) => Promise<any>;
  };
  purchaseOrders: {
    list: () => Promise<{ orders: any[] }>;
    send: (payload: any) => Promise<any>;
    updateStatus: (id: string, payload: any) => Promise<any>;
    testSmtp: (payload?: any) => Promise<any>;
  };
  billing: {
    summary: (organizationId?: string) => Promise<any>;
    checkout: (payload: any) => Promise<any>;
    assignPlan: (payload: any) => Promise<any>;
    contactSales: (payload: any) => Promise<any>;
    portal: (payload?: any) => Promise<any>;
  };
};

export const appApi: AppApi;
export const activeApiProvider: string;
