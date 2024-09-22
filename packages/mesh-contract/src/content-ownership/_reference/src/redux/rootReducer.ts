import {combineReducers} from 'redux';
import createPostReducer from './reducers/createPost';
import walletAddressReducer from "./reducers/walletAddress"
import accountReducer from "./reducers/account"
import userAddressReducer from './reducers/userAddress';
import assetReducer from "./reducers/asset"
import walletListReducer from "./reducers/walletList"
import collateralUtxoReducer from './reducers/collateralUtxo';
import feeUtxoReducer from './reducers/feeUtxo';
import getContentDataReducer from './reducers/getContentData';
import assetsListReducer from './reducers/assetsList';

const rootReducer = combineReducers({
    createPost:createPostReducer,
    walletAddress:walletAddressReducer,
    account:accountReducer,
    userAddress:userAddressReducer,
    asset :assetReducer,
    walletList:walletListReducer,
    collateralUtxo:collateralUtxoReducer,
    feeUtxo:feeUtxoReducer,
    getContentData:getContentDataReducer,
    assetsList:assetsListReducer
    // all reducers go here
  });
  
  export type RootReducer = ReturnType<typeof rootReducer>;
  
  export default rootReducer;
  