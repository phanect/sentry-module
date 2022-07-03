import merge from 'lodash.mergewith'
import * as Integrations from '@sentry/integrations'
import type { Consola } from 'consola'
import type { Module } from '@nuxt/types'
import type { IntegrationsConfiguration, LazyConfiguration, ResolvedModuleConfiguration, TracingConfiguration } from '../../types/sentry'
import { canInitialize } from './utils'

export const PLUGGABLE_INTEGRATIONS = ['CaptureConsole', 'Debug', 'Dedupe', 'ExtraErrorData', 'ReportingObserver', 'RewriteFrames', 'Vue']
export const BROWSER_INTEGRATIONS = ['InboundFilters', 'FunctionToString', 'TryCatch', 'Breadcrumbs', 'GlobalHandlers', 'LinkedErrors', 'UserAgent']
const SERVER_INTEGRATIONS = ['CaptureConsole', 'Debug', 'Dedupe', 'ExtraErrorData', 'RewriteFrames', 'Modules', 'Transaction']

const filterDisabledIntegration = (integrations: IntegrationsConfiguration) => Object.keys(integrations).filter(key => integrations[key])

async function getApiMethods (packageName: string) {
  const packageApi = await import(packageName)

  const apiMethods = []
  for (const key in packageApi) {
    // @ts-ignore
    if (typeof packageApi[key] === 'function') {
      apiMethods.push(key)
    }
  }

  return apiMethods
}

export async function resolveRelease (moduleOptions: ResolvedModuleConfiguration): Promise<string | undefined> {
  if (!('release' in moduleOptions.config)) {
    // Determine "config.release" automatically from local repo if not provided.
    try {
      // @ts-ignore
      const SentryCli = await (import('@sentry/cli').then(m => m.default || m))
      const cli = new SentryCli()
      return (await cli.releases.proposeVersion()).trim()
    } catch {
      // Ignore
    }
  }
}

function resolveLazyOptions (options: ResolvedModuleConfiguration, apiMethods: string[], logger: Consola) {
  if (options.lazy) {
    const defaultLazyOptions = {
      injectMock: true,
      injectLoadHook: false,
      mockApiMethods: true,
      chunkName: 'sentry',
      webpackPrefetch: false,
      webpackPreload: false
    }

    options.lazy = <Required<LazyConfiguration>>(
      merge({}, defaultLazyOptions, options.lazy)
    )

    if (!options.lazy.injectMock) {
      options.lazy.mockApiMethods = []
    } else if (options.lazy.mockApiMethods === true) {
      options.lazy.mockApiMethods = apiMethods
    } else if (Array.isArray(options.lazy.mockApiMethods)) {
      const mockMethods = options.lazy.mockApiMethods
      options.lazy.mockApiMethods = mockMethods.filter(method => apiMethods.includes(method))

      const notfoundMethods = mockMethods.filter(method => !apiMethods.includes(method))
      if (notfoundMethods.length) {
        logger.warn('Some specified methods to mock weren\'t found in @sentry/browser:', notfoundMethods)
      }

      if (!options.lazy.mockApiMethods.includes('captureException')) {
      // always add captureException if a sentry mock is requested
        options.lazy.mockApiMethods.push('captureException')
      }
    }
  }
}

function resolveTracingOptions (options: ResolvedModuleConfiguration) {
  if (options.tracing) {
    options.tracing = merge({
      tracesSampleRate: 1.0,
      vueOptions: {
        tracing: true,
        tracingOptions: {
          hooks: ['mount', 'update'],
          timeout: 2000,
          trackComponents: true
        }
      },
      browserOptions: {}
    }, typeof options.tracing === 'boolean' ? {} : options.tracing)
    if (!options.config.tracesSampleRate) {
      options.config.tracesSampleRate = (options.tracing as TracingConfiguration).tracesSampleRate
    }
  }
}

export async function resolveClientOptions (
  moduleContainer: ThisParameterType<Module>,
  moduleOptions: ResolvedModuleConfiguration,
  logger: Consola
): Promise<any> {
  const options: ResolvedModuleConfiguration = merge({}, moduleOptions)

  options.clientConfig = merge({}, options.config, options.clientConfig)

  const apiMethods = await getApiMethods('@sentry/browser')
  resolveLazyOptions(options, apiMethods, logger)
  resolveTracingOptions(options)

  for (const name of Object.keys(options.clientIntegrations)) {
    if (!PLUGGABLE_INTEGRATIONS.includes(name) && !BROWSER_INTEGRATIONS.includes(name)) {
      logger.warn(`Sentry clientIntegration "${name}" is not recognized and will be ignored.`)
      delete options.clientIntegrations[name]
    }
  }

  return {
    PLUGGABLE_INTEGRATIONS,
    BROWSER_INTEGRATIONS,
    dev: moduleContainer.options.dev,
    runtimeConfigKey: options.runtimeConfigKey,
    config: {
      dsn: options.dsn,
      ...options.clientConfig
    },
    lazy: options.lazy,
    apiMethods,
    logMockCalls: options.logMockCalls, // for mocked only
    tracing: options.tracing,
    initialize: canInitialize(options),
    integrations: filterDisabledIntegration(options.clientIntegrations)
      .reduce((res, key) => {
        // @ts-ignore
        res[key] = options.clientIntegrations[key]
        return res
      }, {})
  }
}

export async function resolveServerOptions (
  moduleContainer: ThisParameterType<Module>,
  moduleOptions: ResolvedModuleConfiguration,
  logger: Consola
): Promise<any> {
  const options: ResolvedModuleConfiguration = merge({}, moduleOptions)

  for (const name of Object.keys(options.serverIntegrations)) {
    if (!SERVER_INTEGRATIONS.includes(name)) {
      logger.warn(`Sentry serverIntegration "${name}" is not recognized and will be ignored.`)
      delete options.serverIntegrations[name]
    }
  }

  const defaultConfig = {
    dsn: options.dsn,
    intergrations: filterDisabledIntegration(options.serverIntegrations)
      .map((name) => {
        const opt = options.serverIntegrations[name]
        // @ts-ignore
        return Object.keys(opt).length ? new Integrations[name](opt) : new Integrations[name]()
      })
  }
  options.config = merge(defaultConfig, options.config, options.serverConfig)

  const { publicRuntimeConfig } = moduleContainer.options
  const { runtimeConfigKey } = options
  if (typeof (publicRuntimeConfig) !== 'function' && runtimeConfigKey && runtimeConfigKey in publicRuntimeConfig) {
    merge(options.config, publicRuntimeConfig[runtimeConfigKey].config, publicRuntimeConfig[runtimeConfigKey].serverConfig)
  }

  const apiMethods = await getApiMethods('@sentry/node')
  resolveLazyOptions(options, apiMethods, logger)
  resolveTracingOptions(options)

  return {
    config: options.config,
    apiMethods,
    lazy: options.lazy,
    logMockCalls: options.logMockCalls // for mocked only
  }
}
