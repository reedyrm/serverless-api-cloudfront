const path = require('path');
const _ = require('lodash');
const chalk = require('chalk');
const yaml = require('js-yaml');
const fs = require('fs');

class ServerlessApiCloudFrontPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'before:deploy:createDeploymentArtifacts': this.createDeploymentArtifacts.bind(this),
      'aws:info:displayStackOutputs': this.printSummary.bind(this),
    };
  }

  createDeploymentArtifacts() {
    const baseResources = this.serverless.service.provider.compiledCloudFormationTemplate;

    const filename = path.resolve(__dirname, 'resources.yml');
    const content = fs.readFileSync(filename, 'utf-8');
    const resources = yaml.safeLoad(content, {
      filename: filename
    });

    this.prepareResources(resources);
    return _.merge(baseResources, resources);
  }

  printSummary() {
    const cloudTemplate = this.serverless;

    const awsInfo = _.find(this.serverless.pluginManager.getPlugins(), (plugin) => {
      return plugin.constructor.name === 'AwsInfo';
    });

    if (!awsInfo || !awsInfo.gatheredData) {
      return;
    }

    const outputs = awsInfo.gatheredData.outputs;
    const apiDistributionDomain = _.find(outputs, (output) => {
      return output.OutputKey === 'ApiDistribution';
    });

    if (!apiDistributionDomain || !apiDistributionDomain.OutputValue) {
      return ;
    }

    const cnameDomain = this.getConfig('domain', '-');

    this.serverless.cli.consoleLog(chalk.yellow('CloudFront domain name'));
    this.serverless.cli.consoleLog(`  ${apiDistributionDomain.OutputValue} (CNAME: ${cnameDomain})`);
  }

  prepareResources(resources) {
    const distributionConfig = resources.Resources.ApiDistribution.Properties.DistributionConfig;

    this.prepareLogging(distributionConfig);
    this.prepareDomain(distributionConfig);
    this.preparePriceClass(distributionConfig);
    this.prepareOrigins(distributionConfig);
    this.prepareCookies(distributionConfig);
    this.prepareHeaders(distributionConfig);
    this.prepareQueryString(distributionConfig);
    this.prepareComment(distributionConfig);
    this.prepareCertificate(distributionConfig);
    this.prepareWaf(distributionConfig);
    this.prepareCompress(distributionConfig);
    this.prepareCachedVerbs(distributionConfig);
    this.prepareTTLs(distributionConfig);
    this.prepareRootObject(distributionConfig);
    this.prepareCustomErrorResponses(distributionConfig);
    this.prepareCacheBehaviors(distributionConfig);
  }

  prepareLogging(distributionConfig) {
    const loggingBucket = this.getConfig('logging.bucket', null);

    if (loggingBucket !== null) {
      distributionConfig.Logging.Bucket = loggingBucket;
      distributionConfig.Logging.Prefix = this.getConfig('logging.prefix', '');

    } else {
      delete distributionConfig.Logging;
    }
  }

  prepareDomain(distributionConfig) {
    const domain = this.getConfig('domain', null);

    if (domain !== null) {
      distributionConfig.Aliases = Array.isArray(domain) ? domain : [ domain ];
    } else {
      delete distributionConfig.Aliases;
    }
  }

  preparePriceClass(distributionConfig) {
    const priceClass = this.getConfig('priceClass', 'PriceClass_All');
    distributionConfig.PriceClass = priceClass;
  }

  prepareOrigins(distributionConfig) {
    const originProtocolPolicy = this.getConfig('originProtocolPolicy', null);
    if(originProtocolPolicy !== null) {
      distributionConfig.Origins[0].CustomOriginConfig.OriginProtocolPolicy = originProtocolPolicy;
    }
    
    
    const originDomain = this.getConfig('originDomainName', null);
    if (originDomain !== null) {
      distributionConfig.Origins[0].DomainName = originDomain;
    }
    
    
    const originPath = this.getConfig('originPath', `/${this.options.stage}`, {emptyIsValid: true});
    if (originPath !== null) {
      distributionConfig.Origins[0].OriginPath = originPath;
    } else {
      delete distributionConfig.Origins[0].OriginPath;
    }
  }

  prepareCookies(distributionConfig) {
      const forwardCookies = this.getConfig('cookies', 'all');
      distributionConfig.DefaultCacheBehavior.ForwardedValues.Cookies.Forward = Array.isArray(forwardCookies) ? 'whitelist' : forwardCookies;
      if (Array.isArray(forwardCookies)) {
        distributionConfig.DefaultCacheBehavior.ForwardedValues.Cookies.WhitelistedNames = forwardCookies;
      }
  }
  
  prepareHeaders(distributionConfig) {
      const forwardHeaders = this.getConfig('headers', 'none');
      
      if (Array.isArray(forwardHeaders)) {
        distributionConfig.DefaultCacheBehavior.ForwardedValues.Headers = forwardHeaders;
      } else {
        distributionConfig.DefaultCacheBehavior.ForwardedValues.Headers = forwardHeaders === 'none' ? [] : ['*'];
      }
    }

  prepareQueryString(distributionConfig) {
        const forwardQueryString = this.getConfig('querystring', 'all');
        
        if (Array.isArray(forwardQueryString)) {
          distributionConfig.DefaultCacheBehavior.ForwardedValues.QueryString = true;
          distributionConfig.DefaultCacheBehavior.ForwardedValues.QueryStringCacheKeys = forwardQueryString;
        } else {
          distributionConfig.DefaultCacheBehavior.ForwardedValues.QueryString = forwardQueryString === 'all' ? true : false;
        }
      }

  prepareComment(distributionConfig) {
    const name = this.serverless.getProvider('aws').naming.getApiGatewayName();
    distributionConfig.Comment = `Serverless Managed ${name}`;
  }

  prepareCertificate(distributionConfig) {
    const certificate = this.getConfig('certificate', null);

    if (certificate !== null) {
      distributionConfig.ViewerCertificate.AcmCertificateArn = certificate;
    } else {
      delete distributionConfig.ViewerCertificate;
    }
  }

  prepareWaf(distributionConfig) {
    const waf = this.getConfig('waf', null);

    if (waf !== null) {
      distributionConfig.WebACLId = waf;
    } else {
      delete distributionConfig.WebACLId;
    }
  }
  
  prepareCompress(distributionConfig) {
    distributionConfig.DefaultCacheBehavior.Compress = (this.getConfig('compress', false) === true) ? true : false;
  }
  
  prepareCachedVerbs(distributionConfig) {
    distributionConfig.DefaultCacheBehavior.CachedMethods = ['HEAD', 'GET', 'OPTIONS'];
  }
  
  prepareTTLs(distributionConfig) {
    distributionConfig.DefaultCacheBehavior.MinTTL = this.getConfig('MinTTL', 0);
    distributionConfig.DefaultCacheBehavior.MaxTTL = this.getConfig('MaxTTL', 0);
    distributionConfig.DefaultCacheBehavior.DefaultTTL = this.getConfig('DefaultTTL', 0);
  }
  
  prepareRootObject(distributionConfig) {
    const defaultRootObject = this.getConfig('defaultRootObject', '');
    
    if(defaultRootObject) {
      distributionConfig.DefaultRootObject = defaultRootObject;
    }
  }
  
  prepareCustomErrorResponses(distributionConfig) {
    const customErrorResponse = this.getConfig('customErrorResponses', null);
    
    //CustomErrorResponses
    if(customErrorResponse !== null) {
      distributionConfig.CustomErrorResponses = Array.isArray(customErrorResponse) ? customErrorResponse : [ customErrorResponse ];
    } else {
      delete distributionConfig.CustomErrorResponses;
    }
    
  }
  
  prepareCacheBehaviors(distributionConfig) {
    const cacheBehaviors = this.getConfig('cacheBehaviors', null);
  
    //CustomErrorResponses
    if(cacheBehaviors !== null) {
      distributionConfig.CacheBehaviors = Array.isArray(cacheBehaviors) ? cacheBehaviors : [ cacheBehaviors ];
    } else {
      delete distributionConfig.CacheBehaviors;
    }
  }

  getConfig(field, defaultValue, options = {}) {
    const { emptyIsValid = false } = options;
    
    const returnValue = _.get(this.serverless, `service.custom.apiCloudFront.${field}`);
    
    if(emptyIsValid && _.isEmpty(returnValue)) {
      return returnValue;
    } else {
      return returnValue || defaultValue;
    }
  }
}

module.exports = ServerlessApiCloudFrontPlugin;
