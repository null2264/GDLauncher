import React, { memo } from 'react';
import styled from 'styled-components';
import { useSelector } from 'react-redux';
import { _getServer } from '../../../../common/utils/selectors';
import Server from './server';

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  width: 100%;
`;

const NoServer = styled.div`
  width: 100%;
  text-align: center;
  font-size: 25px;
  margin-top: 100px;
`;

const SubNoInstance = styled.div`
  width: 100%;
  text-align: center;
  font-size: 15px;
  margin-top: 20px;
`;

const Servers = () => {
  const servers = useSelector(_getServer);

  return (
    <Container>
      {servers.length > 0 ? (
        servers.map(i => <Server key={i.name} instanceName={i.name} />)
      ) : (
        <NoServer>
          No Server has been installed
          <SubNoInstance>
            Click on the icon in the bottom left corner to add new servers
          </SubNoInstance>
        </NoServer>
      )}
    </Container>
  );
};

export default memo(Servers);
