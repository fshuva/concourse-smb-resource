const path = require('path');
const crypto = require('crypto');
const SmbClient = require('./smbclient');
const Tar = require('./tar');

module.exports = async function resource(mode, input, dest) {
  if (!input || !input.source)
    throw new Error('ERROR: wrong input format');

  if (input.source.debug) console.debug = console.log;

  switch (mode) {
      case 'check': return await docheck(input.source, input.version);
      case 'in': return await doin(input.source, input.params, input.version, dest);
      case 'out': return await doout(input.source, input.params, dest);
      default:
        throw new Error('ERROR: unknown access mode');
  }
};

// OLD CHECK
// async function docheck(source) {
//   const smbclient = new SmbClient(source);
//   return [{ref: calcRef(await smbclient.ls())}];
// }

// CHECK
async function docheck(source) {
  const smbclient = new SmbClient(source);
  const directory = await smbclient.ls();
  const currentTime = new Date();
  const twentyFourHoursAgo = currentTime.setDate(currentTime.getDate() - 1);
  const newFolders = directory.filter((item) => {
    return item.isDirectory && new Date(item.mtime) >= twentyFourHoursAgo;
  }).map((item) => {
    return { name: item.name };
  });
  return [{ ref: calcRef(newFolders) }];
} 

// IN
async function doin(source, {files = [], skip = false} = {}, {ref = null} = {}, dest) {
  if (!dest)
    throw new Error('ERROR: destination is mandatory');
  if (skip) return response(ref); // after put control implicit get with get_params: {skip: true}
  files = Array.isArray(files) ? files : !files ? [] : [files];
  const tar = new Tar();
  const smbclient = new SmbClient(source);
  console.log('retrieve tar ...');
  await smbclient.getTar(tar.path, files);
  console.log('extract tar ...');
  await tar.extract(dest, smbclient.strip);
  await tar.remove();
  return response(calcRef(await smbclient.ls()));
}

// OUT
async function doout(source, {dir = null, files = []} = {}, dest) {
  if (!dest)
    throw new Error('ERROR: destination is mandatory');
  dest = !dir ? dest : path.join(dest, dir);
  files = Array.isArray(files) ? files : !files ? [] : [files];
  const tar = new Tar();
  const smbclient = new SmbClient(source);
  console.log('create tar ...');
  await tar.create(dest);
  console.log('send tar ...');
  await smbclient.putTar(tar.path, files);
  await tar.remove();
  return response(calcRef(await smbclient.ls()));
}

function response(ref) {
  return {version: {ref}};
}

function calcRef(data) {
  return crypto.createHash('md5').update(data).digest("hex").substr(0,8);
}