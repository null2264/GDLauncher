import { omit } from 'lodash';
import path from 'path';
import log from 'electron-log';
import fse from 'fs-extra';
import { promises as fs } from 'fs';
import * as ActionTypes from './actionTypes';
import { _getInstance, _getInstancesPath } from '../utils/selectors';

function updateInstanceConfig(
  instanceName,
  updateFunction,
  forceWrite = false
) {
  return async (dispatch, getState) => {
    const state = getState();
    const instance = _getInstance(state)(instanceName) || {};
    const update = async () => {
      const configPath = path.join(
        _getInstancesPath(state),
        instanceName,
        'config.json'
      );
      const tempConfigPath = path.join(
        _getInstancesPath(state),
        instanceName,
        'config_new_temp.json'
      );
      // Remove queue and name, they are augmented in the reducer and we don't want them in the config file
      const newConfig = updateFunction(omit(instance, ['queue', 'name']));
      // Ensure that the new config is actually valid to write
      try {
        const JsonString = JSON.stringify(newConfig);
        const isJson = JSON.parse(JsonString);
        if (!isJson || typeof isJson !== 'object') {
          const err = `Cannot write this JSON to ${instanceName}. Not an object`;
          log.error(err);
          throw new Error(err);
        }
      } catch {
        const err = `Cannot write this JSON to ${instanceName}. Not parsable`;
        log.error(err, newConfig);
        throw new Error(err);
      }

      try {
        await fs.lstat(configPath);

        await fse.outputJson(tempConfigPath, newConfig);
        await fse.rename(tempConfigPath, configPath);
      } catch {
        if (forceWrite) {
          await fse.outputJson(tempConfigPath, newConfig);
          await fse.rename(tempConfigPath, configPath);
        }
      }
      dispatch({
        type: ActionTypes.UPDATE_INSTANCES,
        instances: {
          ...state.instances.list,
          [instanceName]: updateFunction(instance)
        }
      });
    };

    if (instance?.queue) {
      // Add it to the instance promise queue
      await instance.queue.add(update);
    } else {
      await update();
    }
  };
}

export default updateInstanceConfig;
