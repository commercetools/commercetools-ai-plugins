// Thin client for the Merchant Center settings GraphQL API, the same API the
// Organization > Custom Applications UI and `mc-scripts config:sync` use.
// Lives in the core schema, served by the "administration" target.
export const CORE_GQL = {
  organizations: `query MyOrganizations { myOrganizations { total results { id name } } }`,
  // Capped at 500: enough for the picker, and a clear failure beats silent truncation (see projects()).
  projects: `query MyProjects { myProjects(limit: 500) { total results { key name owner { id } } } }`,
};

// Lives in the Merchant Center backend schema, served by the "mc" target: who is signed in.
// Read only; it pre-fills the contact email on the form.
export const MC_GQL = {
  me: `query Me { me { email } }`,
};

export const GQL = {
  orgState: `query OrgState($entryPointUriPath: String!) {
    organizationExtensionForCustomApplication(entryPointUriPath: $entryPointUriPath) {
      organizationId
      application { id name url status entryPointUriPath }
    }
  }`,
  contact: `query Contact($organizationId: String!) {
    organizationExtension(organizationId: $organizationId) {
      applicationsMaintainerContactInformation { email verifiedEmail }
      installedApplications { id installInAllProjects projects { projectKey } application { id } }
    }
  }`,
  setContact: `mutation SetContact($organizationId: String!, $data: ContactInformationDataInput) {
    setCustomApplicationsMaintainerContactInformation(organizationId: $organizationId, data: $data) { id }
  }`,
  sendVerification: `mutation SendVerification($organizationId: String!) {
    sendLinkToVerifyCustomApplicationsMaintainerContactEmail(organizationId: $organizationId) { token }
  }`,
  changeStatus: `mutation ChangeStatus($organizationId: String!, $applicationId: ID!, $status: CustomApplicationStatus!) {
    changeCustomApplicationStatus(organizationId: $organizationId, applicationId: $applicationId, status: $status) { id status }
  }`,
  install: `mutation Install($organizationId: String!, $applicationId: ID!, $projectKeys: [String]) {
    installCustomApplication(organizationId: $organizationId, applicationId: $applicationId, projectKeys: $projectKeys) { id installInAllProjects }
  }`,
  updateInstall: `mutation UpdateInstall($organizationId: String!, $installedApplicationId: ID!, $projectKeys: [String]) {
    updateCustomApplicationProjectsInstallation(organizationId: $organizationId, installedApplicationId: $installedApplicationId, projectKeys: $projectKeys) { id installInAllProjects }
  }`,
};

export function createSettingsClient({ mcApiUrl, token, fetchImpl = fetch, entryPointUriPath = 'onboarding' }) {
  async function request(query, variables, target = 'settings') {
    const res = await fetchImpl(`${mcApiUrl}/graphql`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-graphql-target': target,
        // Same identifier the CLI uses outside production builds.
        'x-application-id': `__local:${entryPointUriPath}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json();
    if (body.errors?.length) {
      const [e] = body.errors;
      throw new Error(`${e.message} (${e.extensions?.code ?? 'no code'})`);
    }
    return body.data;
  }
  return {
    request,
    organizations: () => request(CORE_GQL.organizations, {}, 'administration'),
    me: () => request(MC_GQL.me, {}, 'mc'),
    orgState: (entryPointUriPath) => request(GQL.orgState, { entryPointUriPath }),
    contact: (organizationId) => request(GQL.contact, { organizationId }),
    setContact: ({ organizationId, email }) => request(GQL.setContact, { organizationId, data: { email } }),
    sendVerification: (organizationId) => request(GQL.sendVerification, { organizationId }),
    changeStatus: (v) => request(GQL.changeStatus, v),
    // Omit projectKeys entirely to request all projects.
    install: (v) => request(GQL.install, v),
    updateInstall: (v) => request(GQL.updateInstall, v),
    // Throws when the result is truncated: a partial list would silently hide projects from the picker.
    projects: async () => {
      const data = await request(CORE_GQL.projects, {}, 'administration');
      if (data.myProjects.total > data.myProjects.results.length) {
        throw new Error(`Only ${data.myProjects.results.length} of ${data.myProjects.total} projects were returned.`);
      }
      return data;
    },
  };
}
