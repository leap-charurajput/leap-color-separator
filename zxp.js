/**
 * archive, generates self signed certificate and signing a zxp package
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const zxpSignCmd = require('zxp-sign-cmd')
const chalk = require('chalk')
const pluginConfig = require('./pluginrc.js')
const isWindows = process.platform.startsWith('win')
const root = pluginConfig.root
const distFolder = pluginConfig.destinationFolder
const pluginFolder = distFolder
const extensionBundleId = pluginConfig.extensionBundleId
const certificate_options = pluginConfig.certificate
const zxpFile = path.join(root, pluginConfig.extensionBundleId + '.zxp')

archive()

function archive() {
    log_progress('ARCHIVE', 'blue')

    prepareCert()
    .then(signPackage)
    .then(res => {
        log_progress(`package is signed: ${zxpFile}`, 'green')
        log_progress('DONE', 'blue')
    })
    .catch(err => {log_error(err)})
}

/**
 * find a custom certificate or generate a self sign the certificate
 *
 * @return {Promise} a promise, that resolves the cert data {path, password}
 */
function prepareCert() {
    const options_custom_cert = certificate_options.customCert
    const options_self_sign = certificate_options.selfSign
    const isCustom = options_custom_cert && options_custom_cert.path.trim() !== ''
    var certPath='', password=''

    if(isCustom) {
        certPath = options_custom_cert.path
        password = options_custom_cert.password
	} else if(options_self_sign){
		certPath = options_self_sign.output
		password = options_self_sign.password
	}

    const isValid = certPath!==undefined && certPath.trim()!==''
    const data = {path: certPath, password}

    // Check if certificate already exists
    if (!isCustom && fs.existsSync(certPath)) {
        log_progress('found existing certificate')
        return Promise.resolve(data)
    }

    // Ensure certificate directory exists
    if (certPath) {
        const certDir = path.dirname(certPath)
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true })
        }
    }

    // on non windows, we need to change the permissions
    if(!isWindows) {
        try {
            var provider = require('zxp-provider').osx
            // for some reason the path returns quoted, so I un-quote
            var unquote = provider.substring(1, provider.length - 1)
            if (fs.existsSync(unquote)) {
                fs.chmodSync(unquote, '755')
            }
        } catch (e) {
            // Ignore chmod errors
        }
    }

    return new Promise((resolve, reject) => {
        if(!isValid) {
            reject('no valid cert info')
            return
        }

        if(isCustom) {
            log_progress('found a custom certificate')
            resolve(data)
		} else {
			log_progress('generating a self signed certificate')
			// Try using library first, if it fails due to spaces, use manual command
			zxpSignCmd.selfSignedCert(options_self_sign, function (error, result) {
                if(error) {
                    // If library fails, try manual command with proper quoting
                    log_progress('Library method failed, trying manual command with proper quoting...')
                    try {
                        const zxpProvider = require('zxp-provider')
                        const zxpCmd = isWindows ? zxpProvider.win : zxpProvider.osx
                        const zxpCmdPath = zxpCmd.replace(/^["']|["']$/g, '') // Remove quotes if present

                        // Build command with properly quoted paths
                        const cmd = `"${zxpCmdPath}" -selfSignedCert ${options_self_sign.country} ${options_self_sign.province} ${options_self_sign.org} ${options_self_sign.name} ${options_self_sign.password} "${options_self_sign.output}" -locality "${options_self_sign.locality}" -orgUnit "${options_self_sign.orgUnit}" -email "${options_self_sign.email}"`

                        execSync(cmd, { stdio: 'inherit' })
                        log_progress('Certificate generated successfully using manual command')
                        resolve(data)
                    } catch (manualError) {
                        log_error('Error generating certificate: ' + (error.message || error))
                        log_error('Manual command also failed: ' + (manualError.message || manualError))
                        log_error('')
                        log_error('Please manually create certificate by running:')
                        const zxpProvider = require('zxp-provider')
                        const zxpCmd = isWindows ? zxpProvider.win : zxpProvider.osx
                        const zxpCmdPath = zxpCmd.replace(/^["']|["']$/g, '')
                        log_error(`"${zxpCmdPath}" -selfSignedCert ${options_self_sign.country} ${options_self_sign.province} ${options_self_sign.org} ${options_self_sign.name} ${options_self_sign.password} "${options_self_sign.output}" -locality "${options_self_sign.locality}" -orgUnit "${options_self_sign.orgUnit}" -email "${options_self_sign.email}"`)
                        reject(manualError)
                    }
                } else {
                    resolve(data)
                }
            })
        }
    })
}

/**
 * sign the package
 *
 * @param  {{path, password}} cert description
 *
 * @return {Promise}  a promise
 */
function signPackage(cert) {
    const options = {
        input: pluginFolder,
        output: zxpFile,
        cert: cert.path,
        password: cert.password
    }

    return new Promise((resolve, reject) => {
        zxpSignCmd.sign(options, function (error, result) {
            if(error) {
                // If library fails, try manual command with proper quoting
                log_progress('Library sign method failed, trying manual command with proper quoting...')
                try {
                    const zxpProvider = require('zxp-provider')
                    const zxpCmd = isWindows ? zxpProvider.win : zxpProvider.osx
                    const zxpCmdPath = zxpCmd.replace(/^["']|["']$/g, '') // Remove quotes if present

                    // Build command with properly quoted paths
                    const cmd = `"${zxpCmdPath}" -sign "${options.input}" "${options.output}" "${options.cert}" ${options.password}`

                    execSync(cmd, { stdio: 'inherit' })
                    log_progress('Package signed successfully using manual command')
                    resolve(result)
                } catch (manualError) {
                    log_error('Error signing package: ' + (error.message || error))
                    log_error('Manual command also failed: ' + (manualError.message || manualError))
                    reject(manualError)
                }
            } else {
                resolve(result)
            }
        })
    })
}

// Utility functions
function log(val) {
    console.log(val)
}

function log_error(val) {
    log_progress(val, 'red')
}

function log_progress(val, color) {
    var c = color ? color : 'yellow'
    console.log(chalk[c](val))
}
