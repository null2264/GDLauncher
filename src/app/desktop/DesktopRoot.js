import React, { useEffect, memo, useState, useRef } from 'react';
import { useDidMount } from 'rooks';
import styled, { keyframes, useTheme } from 'styled-components';
import { Switch } from 'react-router';
import { ipcRenderer } from 'electron';
import { useSelector, useDispatch } from 'react-redux';
import { push } from 'connected-react-router';
import { message, notification } from 'antd';
import { motion, AnimateSharedLayout } from 'framer-motion';
import RouteWithSubRoutes from '../../common/components/RouteWithSubRoutes';
import {
  loginWithAccessToken,
  initManifests,
  initNews,
  loginThroughNativeLauncher,
  switchToFirstValidAccount,
  checkClientToken,
  updateUserData,
  loginWithOAuthAccessToken
} from '../../common/reducers/actions';
import {
  load,
  received,
  requesting
} from '../../common/reducers/loading/actions';
import features from '../../common/reducers/loading/features';
import GlobalStyles from '../../common/GlobalStyles';
import RouteBackground from '../../common/components/RouteBackground';
import ga from '../../common/utils/analytics';
import routes from './utils/routes';
import {
  _getCurrentAccount,
  _getInstance,
  _getInstances
} from '../../common/utils/selectors';
import { isLatestJavaDownloaded } from './utils';
import SystemNavbar from './components/SystemNavbar';
import useTrackIdle from './utils/useTrackIdle';
import { openModal } from '../../common/reducers/modals/actions';
import Message from './components/Message';
import { ACCOUNT_MICROSOFT } from '../../common/utils/constants';
import { position } from 'polished';

const Wrapper = styled.div`
  height: 100vh;
  width: 100vw;
`;

const Container = styled.div`
  /* position: absolute; */
  top: ${props => props.theme.sizes.height.systemNavbar}px;
  height: calc(100vh - ${props => props.theme.sizes.height.systemNavbar}px);
  flex: 1 0;
  width: 100vw;
  display: flex;
  transition: transform 0.2s;
  transition-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1);
  will-change: transform;
`;

const InnerContainer = styled.div`
  display: flex;
  flex-direction: column;
  transition: transform 0.2s;
  transition-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1);
  will-change: transform;
  flex: 1 0 auto;
  width: calc(100vw - 250px);
`;

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 200px;
  background: ${props => props.theme.palette.grey[900]};
`;
const Spinner = keyframes`
  0% {
    transform: translate3d(-50%, -50%, 0) rotate(0deg);
  }
  100% {
    transform: translate3d(-50%, -50%, 0) rotate(360deg);
  }
`;

const Notification = styled(motion.div)`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
  /* background: ${props => props.theme.palette.grey[800]}; */
  /* border: 2px solid ${props => props.theme.palette.colors.green}; */
  border-radius: 5px;
  height: 50px;
  width: 100%;
  /* position: relative; */
  /* overflow: hidden; */
  background: linear-gradient(
    90deg,
    rgba(39, 174, 96, 1) 0%,
    rgba(18, 83, 46, 1) 100%
  );
  &&::before {
    animation: 1.5s linear infinite ${Spinner};
  }
`;

const NotificationContent = styled.div`
  background: ${props => props.theme.palette.grey[800]};
  height: 46px;
  width: calc(100% - 4px);
`;

const NotificationContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  height: 400px;
  padding: 10px;
`;

function DesktopRoot({ store }) {
  const dispatch = useDispatch();
  const currentAccount = useSelector(_getCurrentAccount);
  const clientToken = useSelector(state => state.app.clientToken);
  const javaPath = useSelector(state => state.settings.java.path);
  const location = useSelector(state => state.router.location);
  const startedInstances = useSelector(state => state.startedInstances);
  const modals = useSelector(state => state.modals);
  const shouldShowDiscordRPC = useSelector(state => state.settings.discordRPC);
  const [contentStyle, setContentStyle] = useState({ transform: 'scale(1)' });
  const notificationRef = useRef();
  const theme = useTheme();

  message.config({
    top: 45,
    maxCount: 1
  });

  notification.config({
    placement: 'bottomLeft',
    bottom: 50,
    duration: 0
  });

  const init = async () => {
    dispatch(requesting(features.mcAuthentication));
    const userDataStatic = await ipcRenderer.invoke('getUserData');
    const userData = dispatch(updateUserData(userDataStatic));
    await dispatch(checkClientToken());
    dispatch(initNews());

    const manifests = await dispatch(initManifests());

    let isJavaOK = javaPath;

    if (!isJavaOK) {
      isJavaOK = await isLatestJavaDownloaded(manifests.java, userData, true);
    }

    if (!isJavaOK) {
      dispatch(openModal('JavaSetup', { preventClose: true }));

      // Super duper hacky solution to await the modal to be closed...
      // Please forgive me
      await new Promise(resolve => {
        function checkModalStillOpen(state) {
          return state.modals.find(v => v.modalType === 'JavaSetup');
        }

        let currentValue;
        const unsubscribe = store.subscribe(() => {
          const previousValue = currentValue;
          currentValue = store.getState().modals.length;
          if (previousValue !== currentValue) {
            const stillOpen = checkModalStillOpen(store.getState());

            if (!stillOpen) {
              unsubscribe();
              return resolve();
            }
          }
        });
      });
    }

    if (process.env.NODE_ENV === 'development' && currentAccount) {
      dispatch(received(features.mcAuthentication));
      dispatch(push('/home'));
    } else if (currentAccount) {
      dispatch(
        load(
          features.mcAuthentication,
          dispatch(
            currentAccount.accountType === ACCOUNT_MICROSOFT
              ? loginWithOAuthAccessToken()
              : loginWithAccessToken()
          )
        )
      ).catch(() => {
        dispatch(switchToFirstValidAccount());
      });
    } else {
      dispatch(
        load(features.mcAuthentication, dispatch(loginThroughNativeLauncher()))
      ).catch(console.error);
    }

    if (shouldShowDiscordRPC) {
      ipcRenderer.invoke('init-discord-rpc');
    }

    ipcRenderer.on('custom-protocol-event', (e, data) => {
      console.log(data);
    });
  };

  // Handle already logged in account redirect
  useDidMount(init);

  useEffect(() => {
    if (clientToken && process.env.NODE_ENV !== 'development') {
      ga.setUserId(clientToken);
      ga.trackPage(location.pathname);
    }
  }, [location.pathname, clientToken]);

  useTrackIdle(location.pathname);

  useEffect(() => {
    if (
      modals[0] &&
      modals[0].modalType === 'Settings' &&
      !modals[0].unmounting
    ) {
      setContentStyle({ transform: 'scale(0.4)' });
    } else {
      setContentStyle({ transform: 'scale(1)' });
    }
  }, [modals]);

  return (
    <Wrapper>
      <SystemNavbar />
      <Message />
      <AnimateSharedLayout>
        <Container style={contentStyle}>
          <InnerContainer>
            <GlobalStyles />
            <RouteBackground />
            <Switch>
              {routes.map((route, i) => (
                <RouteWithSubRoutes key={i} {...route} /> // eslint-disable-line
              ))}
            </Switch>
          </InnerContainer>
          <Sidebar>
            <div></div>
            <hr />
            <NotificationContainer>
              {Object.entries(startedInstances).map(([key, value]) => (
                <>
                  <Notification
                    key={key}
                    ref={notificationRef}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{
                      type: 'spring',
                      duration: 0.3,
                      damping: 17,
                      stiffness: 300,
                      delay: 0.25
                    }}
                  >
                    <NotificationContent>{key}</NotificationContent>
                  </Notification>
                  <motion.div
                    style={{
                      position: 'absolute',
                      top: value.position.y,
                      left: value.position.x,
                      background: theme.palette.grey[900],
                      border: `2px solid ${theme.palette.colors.green}`,
                      height: '100px',
                      width: '100px',
                      borderRadius: '10px'
                    }}
                    initial={{
                      x: 0,
                      y: 0,
                      opacity: 1
                    }}
                    animate={{
                      x: window.innerWidth - value.position.x - 150,
                      y:
                        window.innerHeight -
                        value.position.y -
                        140 -
                        50 * (Object.values(startedInstances).length - 1),
                      scaleX: 1.8,
                      scaleY: 0.5,
                      opacity: [null, null, 0]
                    }}
                    transition={{
                      type: 'spring',
                      damping: 30,
                      mass: 3,
                      stiffness: 200
                    }}
                  />
                </>
              ))}
            </NotificationContainer>
          </Sidebar>
        </Container>
      </AnimateSharedLayout>
    </Wrapper>
  );
}

export default memo(DesktopRoot);
