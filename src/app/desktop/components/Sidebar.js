import { _getCurrentAccount } from 'common/utils/selectors';
import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import styled, { keyframes, useTheme } from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTerminal,
  faCog,
  faServer,
  faGamepad
} from '@fortawesome/free-solid-svg-icons';
import { AnimatePresence, motion } from 'framer-motion';
import { extractFace } from '../utils';
import Logo from '../../../ui/Logo';

const MainContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  min-width: 45px;
  margin: 10px;
  width: 45px;
  background: ${props => props.theme.palette.grey[100]};
  border-radius: 5px;
  z-index: 0;
`;

const Menu = styled(motion.div)`
  position: absolute;
  right: 5px;
  bottom: 0;
  top: 0;
  z-index: -1;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  min-width: 45px;
  width: 200px;
  /* transform-origin: right; */
  /* transition: transform 0.2s ease-in-out; */
  /* transform: ${({ opened }) => (opened ? 'scaleX(1);' : 'scaleX(0);')}; */
  background: ${props => props.theme.palette.grey[100]};
  border-radius: 5px;
`;

const SidebarContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  height: 100%;
  max-width: 45px;
  min-width: 45px;
  padding: 5px 0;
  /* margin: 10px; */
  border-radius: 5px;

  background: ${props => props.theme.palette.grey[900]};
`;

const InnerContainer = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 5px;

  .icon {
    color: ${props => props.theme.palette.grey[100]};
  }
`;

const SidebarInnerTopContainer = styled.div`
  height: 30%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 10px;
  padding-top: 15px;
  border-radius: 5px;
  background: ${props => props.theme.palette.grey[900]};
  /* border: 1px solid green; */

  .button {
    width: 100%;
    height: 45px;
    padding: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
  }

  .terminal {
    font-size: 15px;
  }

  .button:hover {
    background: ${props => props.theme.palette.primary.main};
    transition: background 0.2s ease-in-out;
  }
`;

const SidebarInnerBottomContainer = styled.div`
  height: auto;
  width: 100%;
  min-height: 65%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  border-radius: 5px;
  background: ${props => props.theme.palette.grey[900]};
  /* border: 1px solid red; */
  .serversContainer {
    height: 50%;
    padding-top: 5px;
    height: 120px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    /* border: 1px solid ${props => props.theme.palette.grey[300]}; */
    box-sizing: border-box;
  }

  .instancesContainer {
    box-sizing: border-box;
    padding-top: 5px;
    height: 50%;
    margin-bottom: 10px;
    min-height: 180px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    /* border: 1px solid red; */
    /* border: 1px solid ${props => props.theme.palette.grey[300]}; */
  }
`;

const NotificationsContainer = styled.div`
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-start;
  align-items: center;
  padding: 5px;
  height: 100%;
  width: 100%;
`;

const Spinner = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

const Notification = styled(motion.div)`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
  border-radius: 5px;
  height: 38px;
  width: 38px;
  padding: 2px;
  overflow: hidden;

  &::before {
    position: absolute;
    width: 200%;
    height: 200%;
    border-radius: 50%;
    content: '';
    background: ${({ initialized }) =>
      initialized
        ? `linear-gradient(90deg, rgba(39, 174, 96, 1) 0%, rgba(18, 83, 46, 1) 100%)`
        : `linear-gradient(90deg, rgba(250,184,73,1) 0%, rgba(164,119,43,1) 100%)`};

    animation: 1.5s linear infinite ${Spinner};
  }
`;

const NotificationContent = styled.div`
  background: ${props => props.theme.palette.grey[800]};
  height: calc(100% - 2px);
  width: calc(100% - 2px);
  /* border-radius: 50%; */
  border-radius: 5px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ProfileImageContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 5px;
  justify-content: center;
`;

const Sidebar = ({ children }) => {
  const account = useSelector(_getCurrentAccount);
  const startedInstances = useSelector(state => state.startedInstances);
  const startedServers = useSelector(state => state.startedServers);
  const [profileImage, setProfileImage] = useState(null);
  const [opened, setOpened] = useState(false);

  const theme = useTheme();

  useEffect(() => {
    extractFace(account.skin).then(setProfileImage).catch(console.error);
  }, [account]);

  return (
    <MainContainer>
      <AnimatePresence>
        {opened && (
          <Menu
            style={{ originX: 0.9 }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ scaleX: 0 }}
            transition={{
              type: 'spring',
              duration: 0.5,
            //   bounce
            }}
          />
        )}
      </AnimatePresence>
      <SidebarContainer>
        <Logo size={35} pointerCursor />
        <InnerContainer>
          <SidebarInnerTopContainer>
            <div className="button cog">
              <FontAwesomeIcon
                icon={faCog}
                onClick={() => setOpened(prev => !prev)}
              />
            </div>
            <div className="button terminal">
              <FontAwesomeIcon icon={faTerminal} />
            </div>
          </SidebarInnerTopContainer>
          <hr style={{ width: '50%' }} />
          <SidebarInnerBottomContainer>
            <div className="serversContainer">
              <FontAwesomeIcon icon={faServer} className="icon" />
              <NotificationsContainer>
                {Object.entries(startedServers).map(([key, value]) => (
                  <>
                    <Notification
                      key={key}
                      initialized={value.initialized}
                      //   ref={notificationRef}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{
                        type: 'spring',
                        duration: 0.3,
                        damping: 17,
                        stiffness: 300,
                        delay: 0.13
                      }}
                    >
                      <NotificationContent />
                    </Notification>
                    <motion.div
                      style={{
                        position: 'absolute',
                        top: value.position.y,
                        left: value.position.x,
                        background: theme.palette.grey[900],
                        border: `2px solid ${theme.palette.colors.yellow}`,
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
                        duration: 0.8
                      }}
                    />
                  </>
                ))}
              </NotificationsContainer>
            </div>
            <hr style={{ width: '50%', margin: 3 }} />
            <div className="instancesContainer">
              <FontAwesomeIcon icon={faGamepad} className="icon" />
              <NotificationsContainer>
                {Object.entries(startedInstances).map(([key, value]) => (
                  <>
                    <Notification
                      key={key}
                      initialized={value.initialized}
                      //   ref={notificationRef}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{
                        type: 'spring',
                        duration: 0.3,
                        damping: 17,
                        stiffness: 300,
                        delay: 0.13
                      }}
                    >
                      <NotificationContent />
                    </Notification>
                    <motion.div
                      style={{
                        position: 'absolute',
                        top: value.position.y,
                        left: value.position.x,
                        background: theme.palette.grey[900],
                        border: `2px solid ${theme.palette.colors.yellow}`,
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
                        duration: 0.8
                      }}
                    />
                  </>
                ))}
              </NotificationsContainer>
            </div>
          </SidebarInnerBottomContainer>
        </InnerContainer>
        <ProfileImageContainer>
          {profileImage ? (
            <img
              src={`data:image/jpeg;base64,${profileImage}`}
              css={`
                width: 25px;
                height: 25px;
                cursor: pointer;
              `}
              alt="profile"
            />
          ) : (
            <div
              css={`
                width: 25px;
                height: 25px;
                background: ${props => props.theme.palette.grey[100]};
              `}
            />
          )}
        </ProfileImageContainer>
      </SidebarContainer>
    </MainContainer>
  );
};

export default Sidebar;
