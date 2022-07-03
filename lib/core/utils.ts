import type { ResolvedModuleConfiguration } from '../../types/sentry'

/**
 * Returns a human-readable representation of the boolean value.
 *
 * @return     The human-readable string.
 */
export const boolToText = (value: boolean): string => value ? 'enabled' : 'disabled'

/**
 * Returns evaluated boolean value for given boolean-like env variable.
 *
 * @param      env The environement variable
 * @return     Evaluated value
 */
export const envToBool = (env: string | undefined): boolean => Boolean(env && env.toLowerCase() !== 'false' && env !== '0')

/**
 * Determines if Sentry can be initialized.
 *
 * @param      options The module options.
 * @return     True if able to initialize, False otherwise.
 */
export const canInitialize = (options: ResolvedModuleConfiguration): boolean => Boolean(options.initialize && options.dsn)

/**
 * Returns true if browser Sentry is enabled.
 *
 * @param      options The module options.
 * @return     True if browser Sentry is enabled.
 */
export const clientSentryEnabled = (options: ResolvedModuleConfiguration): boolean => !options.disabled && !options.disableClientSide

/**
 * Returns true if node Sentry is enabled.
 *
 * @param      options The module options.
 * @return     True if node Sentry is enabled.
 */
export const serverSentryEnabled = (options: ResolvedModuleConfiguration): boolean => !options.disabled && !options.disableServerSide
