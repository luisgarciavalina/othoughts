// Run through "npm version <x.y.z>": keeps manifest.json and versions.json in step with package.json.
import fs from 'fs';

const version = process.env.npm_package_version;
if (!version) {
	console.error('Run this through: npm version <new version>');
	process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.version = version;
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');

const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
versions[version] = manifest.minAppVersion;
fs.writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');
console.log('manifest.json and versions.json set to ' + version);
