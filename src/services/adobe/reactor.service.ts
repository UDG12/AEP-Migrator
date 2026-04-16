import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type {
  LaunchProperty,
  LaunchExtension,
  LaunchDataElement,
  LaunchRule,
  LaunchRuleComponent,
  LaunchEnvironment,
  LaunchHost,
  AdobeApiResponse,
} from '@/types';

const logger = createLogger('ReactorService');

// ============================================================================
// Types
// ============================================================================

interface ReactorResponse<T> {
  data: T | T[];
  meta?: {
    pagination?: {
      current_page: number;
      next_page: number | null;
      total_pages: number;
      total_count: number;
    };
  };
  links?: {
    self: string;
    next?: string;
  };
}

interface CreatePropertyPayload {
  attributes: {
    name: string;
    platform: 'web' | 'mobile';
    development?: boolean;
    domains?: string[];
    undefinedVarsReturnEmpty?: boolean;
    ruleComponentSequencingEnabled?: boolean;
  };
  type: 'properties';
}

interface CreateExtensionPayload {
  attributes: {
    settings?: string;
  };
  relationships: {
    extension_package: {
      data: { id: string; type: 'extension_packages' };
    };
  };
  type: 'extensions';
}

interface CreateDataElementPayload {
  attributes: {
    name: string;
    settings?: string;
    delegate_descriptor_id: string;
    storage_duration?: 'pageview' | 'session' | 'visitor';
    default_value?: string;
    force_lower_case?: boolean;
    clean_text?: boolean;
  };
  relationships: {
    extension: {
      data: { id: string; type: 'extensions' };
    };
  };
  type: 'data_elements';
}

interface CreateRulePayload {
  attributes: {
    name: string;
  };
  type: 'rules';
}

interface CreateRuleComponentPayload {
  attributes: {
    name: string;
    settings?: string;
    order: number;
    delegate_descriptor_id: string;
    negate?: boolean;
    rule_order?: number;
    timeout?: number;
    delay_next?: boolean;
  };
  relationships: {
    extension: {
      data: { id: string; type: 'extensions' };
    };
    rules: {
      data: Array<{ id: string; type: 'rules' }>;
    };
  };
  type: 'rule_components';
}

// ============================================================================
// Reactor Service (Adobe Launch / Tags API)
// ============================================================================

export class ReactorService extends AdobeBaseClient {
  private companyId: string | null = null;

  constructor(options: Omit<ClientOptions, 'baseUrl' | 'isReactor' | 'sandboxName'>) {
    super({
      ...options,
      baseUrl: config.adobe.reactorUrl,
      isReactor: true,
    });
  }

  // ==========================================================================
  // Company
  // ==========================================================================

  /**
   * Get the company ID for the current organization
   */
  async getCompanyId(): Promise<string> {
    if (this.companyId) {
      return this.companyId;
    }

    logger.info('Fetching company ID');

    const response = await this.get<ReactorResponse<{ id: string }>>(
      adobeEndpoints.reactor.companies
    );

    const companies = Array.isArray(response.data)
      ? response.data
      : [response.data];

    if (companies.length === 0) {
      throw new Error('No companies found for this organization');
    }

    this.companyId = companies[0].id;
    logger.info('Company ID retrieved', { companyId: this.companyId });

    return this.companyId;
  }

  // ==========================================================================
  // Properties
  // ==========================================================================

  /**
   * Fetch all properties for the company
   */
  async listProperties(): Promise<LaunchProperty[]> {
    const companyId = await this.getCompanyId();
    logger.info('Fetching all properties');

    const properties: LaunchProperty[] = [];
    let nextUrl: string | null = `${adobeEndpoints.reactor.companies}/${companyId}/properties`;

    while (nextUrl) {
      const response: ReactorResponse<LaunchProperty> = await this.get<ReactorResponse<LaunchProperty>>(nextUrl);

      const data = Array.isArray(response.data) ? response.data : [response.data];
      properties.push(...data);

      nextUrl = response.links?.next || null;
    }

    logger.info(`Found ${properties.length} properties`);
    return properties;
  }

  /**
   * Get a single property by ID
   */
  async getProperty(propertyId: string): Promise<LaunchProperty> {
    logger.debug('Fetching property', { propertyId });

    const response = await this.get<ReactorResponse<LaunchProperty>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}`
    );

    return Array.isArray(response.data) ? response.data[0] : response.data;
  }

  /**
   * Create a new property
   */
  async createProperty(
    name: string,
    platform: 'web' | 'mobile' = 'web',
    domains?: string[]
  ): Promise<LaunchProperty> {
    const companyId = await this.getCompanyId();
    logger.info('Creating property', { name, platform });

    const payload = {
      data: {
        attributes: {
          name,
          platform,
          domains: domains || [],
          development: false,
        },
        type: 'properties',
      },
    };

    const response = await this.post<ReactorResponse<LaunchProperty>>(
      `${adobeEndpoints.reactor.companies}/${companyId}/properties`,
      payload
    );

    const property = Array.isArray(response.data) ? response.data[0] : response.data;
    logger.info('Property created successfully', { id: property.id });

    return property;
  }

  /**
   * Find property by name
   */
  async findPropertyByName(name: string): Promise<LaunchProperty | null> {
    const properties = await this.listProperties();
    return properties.find((p) => p.attributes.name === name) || null;
  }

  // ==========================================================================
  // Extensions
  // ==========================================================================

  /**
   * List all extensions for a property
   */
  async listExtensions(propertyId: string): Promise<LaunchExtension[]> {
    logger.info('Fetching extensions for property', { propertyId });

    const extensions: LaunchExtension[] = [];
    let nextUrl: string | null = `${adobeEndpoints.reactor.properties}/${propertyId}/extensions`;

    while (nextUrl) {
      const response: ReactorResponse<LaunchExtension> = await this.get<ReactorResponse<LaunchExtension>>(nextUrl);

      const data = Array.isArray(response.data) ? response.data : [response.data];
      extensions.push(...data);

      nextUrl = response.links?.next || null;
    }

    logger.info(`Found ${extensions.length} extensions`);
    return extensions;
  }

  /**
   * Get extension package by name
   */
  async findExtensionPackage(
    name: string
  ): Promise<{ id: string; name: string } | null> {
    logger.debug('Finding extension package', { name });

    const response = await this.get<ReactorResponse<{ id: string; attributes: { name: string } }>>(
      `${adobeEndpoints.reactor.extensionPackages}`,
      { 'filter[name]': `EQ ${name}` }
    );

    const packages = Array.isArray(response.data) ? response.data : [response.data];

    if (packages.length === 0) {
      return null;
    }

    return {
      id: packages[0].id,
      name: packages[0].attributes.name,
    };
  }

  /**
   * Install an extension on a property
   */
  async installExtension(
    propertyId: string,
    extensionPackageId: string,
    settings?: string
  ): Promise<LaunchExtension> {
    logger.info('Installing extension', { propertyId, extensionPackageId });

    const payload = {
      data: {
        attributes: {
          settings,
        },
        relationships: {
          extension_package: {
            data: { id: extensionPackageId, type: 'extension_packages' },
          },
        },
        type: 'extensions',
      },
    };

    const response = await this.post<ReactorResponse<LaunchExtension>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/extensions`,
      payload
    );

    const extension = Array.isArray(response.data) ? response.data[0] : response.data;
    logger.info('Extension installed successfully', { id: extension.id });

    return extension;
  }

  // ==========================================================================
  // Data Elements
  // ==========================================================================

  /**
   * List all data elements for a property
   */
  async listDataElements(propertyId: string): Promise<LaunchDataElement[]> {
    logger.info('Fetching data elements for property', { propertyId });

    const dataElements: LaunchDataElement[] = [];
    let nextUrl: string | null = `${adobeEndpoints.reactor.properties}/${propertyId}/data_elements`;

    while (nextUrl) {
      const response: ReactorResponse<LaunchDataElement> = await this.get<ReactorResponse<LaunchDataElement>>(nextUrl);

      const data = Array.isArray(response.data) ? response.data : [response.data];
      dataElements.push(...data);

      nextUrl = response.links?.next || null;
    }

    logger.info(`Found ${dataElements.length} data elements`);
    return dataElements;
  }

  /**
   * Create a data element
   */
  async createDataElement(
    propertyId: string,
    name: string,
    extensionId: string,
    delegateDescriptorId: string,
    settings?: string,
    options?: {
      storageDuration?: 'pageview' | 'session' | 'visitor';
      defaultValue?: string;
      forceLowerCase?: boolean;
      cleanText?: boolean;
    }
  ): Promise<LaunchDataElement> {
    logger.info('Creating data element', { propertyId, name });

    const payload = {
      data: {
        attributes: {
          name,
          settings,
          delegate_descriptor_id: delegateDescriptorId,
          storage_duration: options?.storageDuration,
          default_value: options?.defaultValue,
          force_lower_case: options?.forceLowerCase,
          clean_text: options?.cleanText,
        },
        relationships: {
          extension: {
            data: { id: extensionId, type: 'extensions' },
          },
        },
        type: 'data_elements',
      },
    };

    const response = await this.post<ReactorResponse<LaunchDataElement>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/data_elements`,
      payload
    );

    const dataElement = Array.isArray(response.data) ? response.data[0] : response.data;
    logger.info('Data element created successfully', { id: dataElement.id });

    return dataElement;
  }

  // ==========================================================================
  // Rules
  // ==========================================================================

  /**
   * List all rules for a property
   */
  async listRules(propertyId: string): Promise<LaunchRule[]> {
    logger.info('Fetching rules for property', { propertyId });

    const rules: LaunchRule[] = [];
    let nextUrl: string | null = `${adobeEndpoints.reactor.properties}/${propertyId}/rules`;

    while (nextUrl) {
      const response: ReactorResponse<LaunchRule> = await this.get<ReactorResponse<LaunchRule>>(nextUrl);

      const data = Array.isArray(response.data) ? response.data : [response.data];
      rules.push(...data);

      nextUrl = response.links?.next || null;
    }

    logger.info(`Found ${rules.length} rules`);
    return rules;
  }

  /**
   * Create a rule
   */
  async createRule(propertyId: string, name: string): Promise<LaunchRule> {
    logger.info('Creating rule', { propertyId, name });

    const payload = {
      data: {
        attributes: { name },
        type: 'rules',
      },
    };

    const response = await this.post<ReactorResponse<LaunchRule>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/rules`,
      payload
    );

    const rule = Array.isArray(response.data) ? response.data[0] : response.data;
    logger.info('Rule created successfully', { id: rule.id });

    return rule;
  }

  /**
   * List rule components for a rule
   */
  async listRuleComponents(ruleId: string): Promise<LaunchRuleComponent[]> {
    logger.debug('Fetching rule components', { ruleId });

    const components: LaunchRuleComponent[] = [];
    let nextUrl: string | null = `${adobeEndpoints.reactor.rules}/${ruleId}/rule_components`;

    while (nextUrl) {
      const response: ReactorResponse<LaunchRuleComponent> = await this.get<ReactorResponse<LaunchRuleComponent>>(nextUrl);

      const data = Array.isArray(response.data) ? response.data : [response.data];
      components.push(...data);

      nextUrl = response.links?.next || null;
    }

    return components;
  }

  /**
   * Create a rule component
   */
  async createRuleComponent(
    propertyId: string,
    ruleId: string,
    extensionId: string,
    name: string,
    delegateDescriptorId: string,
    order: number,
    settings?: string,
    options?: {
      negate?: boolean;
      ruleOrder?: number;
      timeout?: number;
      delayNext?: boolean;
    }
  ): Promise<LaunchRuleComponent> {
    logger.info('Creating rule component', { ruleId, name });

    const payload = {
      data: {
        attributes: {
          name,
          settings,
          order,
          delegate_descriptor_id: delegateDescriptorId,
          negate: options?.negate,
          rule_order: options?.ruleOrder,
          timeout: options?.timeout,
          delay_next: options?.delayNext,
        },
        relationships: {
          extension: {
            data: { id: extensionId, type: 'extensions' },
          },
          rules: {
            data: [{ id: ruleId, type: 'rules' }],
          },
        },
        type: 'rule_components',
      },
    };

    const response = await this.post<ReactorResponse<LaunchRuleComponent>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/rule_components`,
      payload
    );

    const component = Array.isArray(response.data) ? response.data[0] : response.data;
    logger.info('Rule component created successfully', { id: component.id });

    return component;
  }

  // ==========================================================================
  // Environments
  // ==========================================================================

  /**
   * List all environments for a property
   */
  async listEnvironments(propertyId: string): Promise<LaunchEnvironment[]> {
    logger.info('Fetching environments for property', { propertyId });

    const response = await this.get<ReactorResponse<LaunchEnvironment>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/environments`
    );

    const environments = Array.isArray(response.data) ? response.data : [response.data];
    logger.info(`Found ${environments.length} environments`);

    return environments;
  }

  /**
   * Create an environment
   */
  async createEnvironment(
    propertyId: string,
    name: string,
    stage: 'development' | 'staging' | 'production',
    hostId: string
  ): Promise<LaunchEnvironment> {
    logger.info('Creating environment', { propertyId, name, stage });

    const payload = {
      data: {
        attributes: {
          name,
          stage,
        },
        relationships: {
          host: {
            data: { id: hostId, type: 'hosts' },
          },
        },
        type: 'environments',
      },
    };

    const response = await this.post<ReactorResponse<LaunchEnvironment>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/environments`,
      payload
    );

    const environment = Array.isArray(response.data) ? response.data[0] : response.data;
    logger.info('Environment created successfully', { id: environment.id });

    return environment;
  }

  // ==========================================================================
  // Hosts
  // ==========================================================================

  /**
   * List all hosts for a property
   */
  async listHosts(propertyId: string): Promise<LaunchHost[]> {
    logger.info('Fetching hosts for property', { propertyId });

    const response = await this.get<ReactorResponse<LaunchHost>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/hosts`
    );

    const hosts = Array.isArray(response.data) ? response.data : [response.data];
    logger.info(`Found ${hosts.length} hosts`);

    return hosts;
  }

  /**
   * Create an Akamai host
   */
  async createAkamaiHost(propertyId: string, name: string): Promise<LaunchHost> {
    logger.info('Creating Akamai host', { propertyId, name });

    const payload = {
      data: {
        attributes: {
          name,
          type_of: 'akamai',
        },
        type: 'hosts',
      },
    };

    const response = await this.post<ReactorResponse<LaunchHost>>(
      `${adobeEndpoints.reactor.properties}/${propertyId}/hosts`,
      payload
    );

    const host = Array.isArray(response.data) ? response.data[0] : response.data;
    logger.info('Host created successfully', { id: host.id });

    return host;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createReactorService(
  accessToken: string,
  clientId: string,
  orgId: string
): ReactorService {
  return new ReactorService({
    accessToken,
    clientId,
    orgId,
  });
}
