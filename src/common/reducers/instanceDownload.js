import path from 'path';
import makeDir from 'make-dir';
import lockfile from 'lockfile';
import { coerce, gt, lte } from 'semver';
import fse from 'fs-extra';
import { promises as fs } from 'fs';
import axios from 'axios';
import pMap from 'p-map';
import Seven, { extractFull } from 'node-7z';
import * as ActionTypes from './actionTypes';
import {
  _getCurrentDownloadItem,
  _getDataStorePath,
  _getInstancesPath,
  _getJavaPath,
  _getLibrariesPath,
  _getMinecraftVersionsPath,
  _getTempPath
} from '../utils/selectors';
import updateInstanceConfig from './updateInstanceConfig';
import {
  get7zPath,
  getFileHash,
  getFilesRecursive,
  librariesMapper,
  mavenToArray,
  normalizeModData,
  patchForge113
} from '../../app/desktop/utils';
import { getAddon, getAddonFile, getFabricJson } from '../api';
import {
  CURSEFORGE,
  FABRIC,
  FMLLIBS_FORGE_BASE_URL,
  FMLLIBS_OUR_BASE_URL,
  FORGE,
  FTB
} from '../utils/constants';
import { downloadFile } from '../../app/desktop/utils/downloader';
import fmlLibsMapping from '../../app/desktop/utils/fmllibs';

export default function addToQueue(
  instanceName,
  loader,
  manifest,
  background,
  timePlayed
) {
  return async (dispatch, getState) => {
    const state = getState();

    // Collect all steps

    let loaderLibraries = [];
    let sourceLibraries = [];

    switch (loader.loaderType) {
      case FORGE:
        loaderLibraries = await dispatch(
          downloadForge({ instanceName, loader, manifest })
        );
        break;
      case FABRIC:
        loaderLibraries = await dispatch(
          downloadFabric({ instanceName, loader, manifest })
        );
        break;
      default:
        break;
    }

    let sourceData;
    switch (loader.source) {
      case CURSEFORGE:
        sourceData = await dispatch(
          processCurseForgeManifest({
            instanceName,
            loader,
            manifest
          })
        );
        break;
      case FTB:
        break;
      default:
        break;
    }

    sourceLibraries = sourceData.modsToDownload;

    await new Promise(resolve => {
      // Force premature unlock to let our listener catch mods from override
      lockfile.unlock(
        path.join(
          _getInstancesPath(getState()),
          instanceName,
          'installing.lock'
        ),
        err => {
          if (err) console.error(err);
          resolve();
        }
      );
    });

    await makeDir(path.join(_getInstancesPath(state), instanceName));
    lockfile.lock(
      path.join(_getInstancesPath(state), instanceName, 'installing.lock'),
      err => {
        if (err) console.error(err);
      }
    );

    await Promise.all(
      sourceData.overrideFiles.map(v => {
        const relativePath = path.relative(
          path.join(_getTempPath(state), instanceName, 'overrides'),
          v
        );
        const newPath = path.join(
          _getInstancesPath(state),
          instanceName,
          relativePath
        );
        return fse.copy(v, newPath, { overwrite: true });
      })
    );

    await fse.remove(path.join(_getTempPath(state), instanceName));

    const totalFiles = loaderLibraries.concat(sourceLibraries);

    dispatch({
      type: ActionTypes.ADD_DOWNLOAD_TO_QUEUE,
      instanceName,
      loader,
      manifest,
      background,
      filesToDownload: totalFiles
    });

    dispatch(
      updateInstanceConfig(
        instanceName,
        prev => {
          return {
            ...(prev || {}),
            loader,
            timePlayed: prev.timePlayed || timePlayed || 0,
            background,
            mods: [...(prev.mods || []), ...sourceData.modManifests],
            overrides: sourceData.overrideFiles.map(v =>
              path.relative(
                path.join(_getTempPath(state), instanceName, 'overrides'),
                v
              )
            )
          };
        },
        true
      )
    );
  };
}

function processCurseForgeManifest({ instanceName, manifest }) {
  return async (dispatch, getState) => {
    const state = getState();

    let modManifests = [];
    let modsToDownload = [];
    await pMap(
      manifest.files,
      async item => {
        let ok = false;
        let tries = 0;
        /* eslint-disable no-await-in-loop */
        do {
          tries += 1;
          if (tries !== 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          try {
            const { data: addon } = await getAddon(item.projectID);
            const modManifest = (
              await getAddonFile(item.projectID, item.fileID)
            ).data;
            const destFile = path.join(
              _getInstancesPath(state),
              instanceName,
              addon?.categorySection?.path || 'mods',
              modManifest.fileName
            );
            modManifests = modManifests.concat(
              normalizeModData(modManifest, item.projectID, addon.name)
            );
            modsToDownload = modsToDownload.concat({
              url: modManifest.downloadUrl,
              path: destFile
            });
            ok = true;
          } catch (err) {
            console.error(err);
          }
        } while (!ok && tries <= 3);
        /* eslint-enable no-await-in-loop */
      },
      { concurrency: 10 }
    );

    const addonPathZip = path.join(
      _getTempPath(state),
      instanceName,
      'addon.zip'
    );
    const sevenZipPath = await get7zPath();
    const extraction = extractFull(
      addonPathZip,
      path.join(_getTempPath(state), instanceName),
      {
        recursive: true,
        $bin: sevenZipPath,
        yes: true,
        $cherryPick: 'overrides',
        $progress: true
      }
    );
    await new Promise((resolve, reject) => {
      extraction.on('end', () => {
        resolve();
      });
      extraction.on('error', err => {
        reject(err.stderr);
      });
    });

    const overrideFiles = await getFilesRecursive(
      path.join(_getTempPath(state), instanceName, 'overrides')
    );

    return {
      overrideFiles,
      modsToDownload,
      modManifests
    };
  };
}

function downloadFabric({ loader }) {
  return async (dispatch, getState) => {
    const state = getState();
    let fabricJson;
    const fabricJsonPath = path.join(
      _getLibrariesPath(state),
      'net',
      'fabricmc',
      loader?.mcVersion,
      loader?.loaderVersion,
      'fabric.json'
    );
    try {
      fabricJson = await fse.readJson(fabricJsonPath);
    } catch (err) {
      fabricJson = (await getFabricJson(loader)).data;
      await fse.outputJson(fabricJsonPath, fabricJson);
    }
    const libraries = librariesMapper(
      fabricJson.libraries,
      _getLibrariesPath(state)
    );

    return libraries;
  };
}

function downloadForge({ instanceName, loader }) {
  return async (dispatch, getState) => {
    const state = getState();
    const forgeJson = {};

    let forgeLibraries = [];
    const forgeJsonPath = path.join(
      _getLibrariesPath(state),
      'net',
      'minecraftforge',
      loader?.loaderVersion,
      `${loader?.loaderVersion}.json`
    );

    const sevenZipPath = await get7zPath();
    const pre152 = lte(coerce(loader?.mcVersion), coerce('1.5.2'));
    const pre132 = lte(coerce(loader?.mcVersion), coerce('1.3.2'));
    const baseUrl = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
    const tempInstaller = path.join(
      _getTempPath(state),
      `${loader?.loaderVersion}.jar`
    );
    const expectedInstaller = path.join(
      _getDataStorePath(state),
      'forgeInstallers',
      `${loader?.loaderVersion}.jar`
    );

    const extractSpecificFile = async from => {
      const extraction = extractFull(tempInstaller, _getTempPath(state), {
        $bin: sevenZipPath,
        yes: true,
        $cherryPick: from
      });
      await new Promise((resolve, reject) => {
        extraction.on('end', () => {
          resolve();
        });
        extraction.on('error', error => {
          reject(error.stderr);
        });
      });
    };

    try {
      await fs.access(expectedInstaller);
      if (!pre152) {
        await fs.access(forgeJsonPath);
      }
      const { data: hashes } = await axios.get(
        `https://files.minecraftforge.net/net/minecraftforge/forge/${loader?.loaderVersion}/meta.json`
      );
      const fileMd5 = await getFileHash(expectedInstaller, 'md5');
      let expectedMd5 = hashes?.classifiers?.installer?.jar;
      if (pre132) {
        expectedMd5 = hashes?.classifiers?.client?.zip;
      } else if (pre152) {
        expectedMd5 = hashes?.classifiers?.universal?.zip;
      }

      if (fileMd5.toString() !== expectedMd5) {
        throw new Error('Installer hash mismatch');
      }
      await fse.copy(expectedInstaller, tempInstaller, { overwrite: true });
    } catch (err) {
      console.warn(
        'No installer found in temp or hash mismatch. Need to download it.'
      );

      let urlTerminal = 'installer.jar';
      if (pre132) {
        urlTerminal = 'client.zip';
      } else if (pre152) {
        urlTerminal = 'universal.zip';
      }

      // Download installer jar and extract stuff
      await downloadFile(
        tempInstaller,
        `${baseUrl}/${loader?.loaderVersion}/forge-${loader?.loaderVersion}-${urlTerminal}`
      );

      await new Promise(resolve => setTimeout(resolve, 200));
      await fse.copy(tempInstaller, expectedInstaller);
    }

    if (gt(coerce(loader?.mcVersion), coerce('1.5.2'))) {
      // Extract version / install json, main jar, universal and client lzma
      await extractSpecificFile('install_profile.json');
      const installerJson = await fse.readJson(
        path.join(_getTempPath(state), 'install_profile.json')
      );

      if (installerJson.install) {
        forgeJson.install = installerJson.install;
        forgeJson.version = installerJson.versionInfo;
      } else {
        forgeJson.install = installerJson;
        await extractSpecificFile(path.basename(installerJson.json));
        forgeJson.version = await fse.readJson(
          path.join(_getTempPath(state), installerJson.json)
        );
        await fse.remove(path.join(_getTempPath(state), installerJson.json));
      }

      await fse.remove(path.join(_getTempPath(state), 'install_profile.json'));

      await fse.outputJson(forgeJsonPath, forgeJson);

      // Extract forge bin
      if (forgeJson.install.filePath) {
        await extractSpecificFile(forgeJson.install.filePath);

        await fse.move(
          path.join(_getTempPath(state), forgeJson.install.filePath),
          path.join(
            _getLibrariesPath(state),
            ...mavenToArray(forgeJson.install.path)
          ),
          { overwrite: true }
        );
      } else {
        // Move all files in maven
        const forgeBinPathInsideZip = path.join(
          'maven',
          path.dirname(path.join(...mavenToArray(forgeJson.install.path)))
        );
        await extractSpecificFile(forgeBinPathInsideZip);

        const filesToMove = await fs.readdir(
          path.join(_getTempPath(state), forgeBinPathInsideZip)
        );
        await Promise.all(
          filesToMove.map(async f => {
            await fse.move(
              path.join(_getTempPath(state), forgeBinPathInsideZip, f),
              path.join(
                _getLibrariesPath(state),
                path.dirname(
                  path.join(...mavenToArray(forgeJson.install.path))
                ),
                path.basename(f)
              ),
              { overwrite: true }
            );
          })
        );

        await fse.remove(path.join(_getTempPath(state), 'maven'));
      }

      let { libraries } = forgeJson.version;

      if (forgeJson.install.libraries) {
        libraries = libraries.concat(forgeJson.install.libraries);
      }

      forgeLibraries = librariesMapper(
        libraries.filter(
          v =>
            !v.name.includes('net.minecraftforge:forge:') &&
            !v.name.includes('net.minecraftforge:minecraftforge:')
        ),
        _getLibrariesPath(state)
      );
    } else {
      // Download necessary libs
      forgeLibraries = fmlLibsMapping[loader?.mcVersion].map(lib => {
        const fileName = path.join(
          _getInstancesPath(state),
          instanceName,
          'lib',
          lib[0]
        );
        const baseFmlUrl = lib[2]
          ? FMLLIBS_OUR_BASE_URL
          : FMLLIBS_FORGE_BASE_URL;

        return {
          url: baseFmlUrl,
          path: fileName,
          sha1: lib[1]
        };
      });

      // Perform forge injection
      const mcJarPath = path.join(
        _getMinecraftVersionsPath(state),
        `${loader?.mcVersion}.jar`
      );
      const mcJarForgePath = path.join(
        _getMinecraftVersionsPath(state),
        `${loader?.loaderVersion}.jar`
      );
      await fse.copy(mcJarPath, mcJarForgePath);

      const metaInfDeletion = Seven.delete(mcJarForgePath, 'META-INF', {
        $bin: sevenZipPath,
        yes: true
      });
      await new Promise((resolve, reject) => {
        metaInfDeletion.on('end', () => {
          resolve();
        });
        metaInfDeletion.on('error', error => {
          reject(error.stderr);
        });
      });

      await fse.remove(path.join(_getTempPath(state), loader?.loaderVersion));

      // This is garbage, need to use a stream somehow to directly inject data from/to jar
      const extraction = extractFull(
        tempInstaller,
        path.join(_getTempPath(state), loader?.loaderVersion),
        {
          $bin: sevenZipPath,
          yes: true
        }
      );
      await new Promise((resolve, reject) => {
        extraction.on('end', () => {
          resolve();
        });
        extraction.on('error', error => {
          reject(error.stderr);
        });
      });

      const updatedFiles = Seven.add(
        mcJarForgePath,
        `${path.join(_getTempPath(state), loader?.loaderVersion)}/*`,
        {
          $bin: sevenZipPath,
          yes: true
        }
      );
      await new Promise((resolve, reject) => {
        updatedFiles.on('end', () => {
          resolve();
        });
        updatedFiles.on('error', error => {
          reject(error.stderr);
        });
      });

      await fse.remove(path.join(_getTempPath(state), loader?.loaderVersion));
    }

    await fse.remove(tempInstaller);

    return forgeLibraries;
  };
}
