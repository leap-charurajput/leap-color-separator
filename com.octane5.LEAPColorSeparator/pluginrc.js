const path = require('path')
const root = __dirname
const srcFolder = path.join(root, "src")
const destFolder = path.join(root, "com.octane5.LEAPColorSeparator")
const certPath = path.join(destFolder, "cert.p12")
module.exports = {
	extensionBundleId: 'com.octane5.LEAPColorSeparator',
	extensionBundleName: 'com.octane5.LEAPColorSeparator',
	extensionBundleVersion: '1.0.1',
	cepVersion: '7.0',
	panelName: 'LEAP Color Separator',
	width: '500',
	height: '600',
	root: root,
	sourceFolder: srcFolder,
	destinationFolder: destFolder,
	certificate : {
		customCert: {
			path: '',
			password: 'charurajput'
		},
		selfSign: {
			country: 'US',
			province: 'CA',
			org: 'org',
			name: 'LEAP',
			password: 'charurajput',
			locality: 'New York',
			orgUnit: 'New York',
			email: 'charurajput89@gmail.com',
			output: certPath
		}
	}
}
