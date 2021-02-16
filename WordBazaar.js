import FUNGIBLE_TOKEN_CONTRACT from 'wordbazaar-contracts/FungibleTokenCustom.aes';
import TOKEN_VOTING_CONTRACT from 'wordbazaar-contracts/TokenVoting.aes';
import TOKEN_SALE_CONTRACT from 'wordbazaar-contracts/TokenSale.aes';
import WORD_REGISTRY_CONTRACT from 'wordbazaar-contracts/WordRegistry.aes';
import BONDING_CURVE from 'sophia-bonding-curve/BondCurveLinear.aes';
import BigNumber from 'bignumber.js';
import { get } from 'lodash';

const WORD_REGISTRY_ADDRESS = 'ct_zPka9jyqrRdRQX3XuZEMsdzydcRvULVWFqRpqgZmTb1EszfQT';
const shiftDecimalPlaces = (amount, decimals) => new BigNumber(amount).shiftedBy(decimals);
const sdk = (rootState, path) => get(rootState, path);
 
export default class WordBazaar {
  constructor(wordRegistryAddress, sdkPath) {
    wordRegistryAddress = wordRegistryAddress;
    sdkPath = sdkPath;
    this.state = {
      tokenVotingContracts: {},
      tokenSaleContracts: {},
      fungibleTokenContracts: {},
    };

    this.mutations = {
      setTokenVotingContract(state, contractAddress, instance) {
        state.tokenVotingContracts[contractAddress] = instance;
      },
      setTokenSaleContract(state, contractAddress, instance) {
        state.tokenSaleContracts[contractAddress] = instance;
      },
      setWordRegistryContract(state, instance) {
        state.wordRegistryContract = instance;
      },
      setFungibleTokenContract(state, contractAddress, instance) {
        state.fungibleTokenContracts[contractAddress] = instance;
      },
    };
    this.actions = {
      async initWordRegistryContractIfNeeded({
        commit,
        state: { wordRegistryContract },
        rootState,
      }) {
        if (!wordRegistryContract) {
          const contract = await sdk(rootState, sdkPath)
            .getContractInstance(WORD_REGISTRY_CONTRACT,
              { contractAddress: wordRegistryAddress });
          commit('setWordRegistryContract', contract);
          return contract;
        }

        return wordRegistryContract;
      },
      async initTokenVotingContractIfNeeded(
        { commit, state: { tokenVotingContracts }, rootState },
        contractAddress,
      ) {
        if (!tokenVotingContracts[contractAddress]) {
          const contract = await sdk(rootState, sdkPath)
            .getContractInstance(TOKEN_VOTING_CONTRACT, { contractAddress });
          commit('setTokenVotingContract', contractAddress, contract);
          return contract;
        }

        return tokenVotingContracts[contractAddress];
      },
      async initTokenSaleContractIfNeeded(
        { commit, state: { tokenSaleContracts }, rootState },
        contractAddress,
      ) {
        if (!tokenSaleContracts[contractAddress]) {
          const contract = await sdk(rootState, sdkPath)
            .getContractInstance(TOKEN_SALE_CONTRACT, { contractAddress });
          commit('setTokenSaleContract', contractAddress, contract);
          return contract;
        }

        return tokenSaleContracts[contractAddress];
      },
      async deployBondingCurve({ rootState }, decimals) {
        // alters bonding curve contract to change the dependency default 1 alpha to 18
        // as we use 18 decimals and thus need to adjust the curve to match that
        const BONDING_CURVE_DECIMALS = BONDING_CURVE.replace(
          'function alpha() : Frac.frac = Frac.make_frac(1, 1)',
          `function alpha() : Frac.frac = Frac.make_frac(1, ${shiftDecimalPlaces(1, decimals)})`,
        );
        const contract = await sdk(rootState, sdkPath)
          .getContractInstance(BONDING_CURVE_DECIMALS);
        await contract.methods.init();

        return contract.deployInfo.address;
      },
      async deployTokenSaleContract(
        { commit, rootState },
        {
          decimals,
          timeout,
          bondingCurveAddress,
          description,
        },
      ) {
        // alters token sale contract to change the dependency default 1 decimals to 18
        // as we want that as default for use with wordbazaar
        const TOKEN_SALE_CONTRACT_DECIMALS = TOKEN_SALE_CONTRACT.replace(
          'let decimals = 1',
          `let decimals = ${shiftDecimalPlaces(1, decimals)}`,
        );

        const contract = await sdk(rootState, sdkPath)
          .getContractInstance(TOKEN_SALE_CONTRACT_DECIMALS);
        await contract.methods.init(timeout, bondingCurveAddress, description);
        commit('setTokenSaleContract', contract.deployInfo.address, contract);
        return contract.deployInfo.address;
      },
      async deployFungibleTokenContract(
        { commit, rootState },
        {
          name,
          decimals,
          symbol,
          tokenSaleAddress,
        },
      ) {
        const contract = await sdk(rootState, sdkPath)
          .getContractInstance(FUNGIBLE_TOKEN_CONTRACT);
        await contract.methods.init(name, decimals, symbol, tokenSaleAddress, WORD_REGISTRY_ADDRESS);
        commit('setFungibleTokenContract', contract.deployInfo.address, contract);
        return contract.deployInfo.address;
      },
      async deployTokenVotingContract(
        { commit, rootState },
        {
          metadata,
          closeHeight,
          token,
        },
      ) {
        const contract = await sdk(rootState, sdkPath)
          .getContractInstance(TOKEN_VOTING_CONTRACT);
        await contract.methods.init(metadata, closeHeight, token);
        commit('setTokenVotingContract', contract.deployInfo.address, contract);
        return contract.deployInfo.address;
      },
      async wordRegistryAddToken({ dispatch }, addTokenAddress) {
        const contract = await dispatch('initWordRegistryContractIfNeeded');

        const { decodedResult } = await contract.methods.add_token(addTokenAddress);
        return decodedResult;
      },
      async tokenSaleMethod(
        { dispatch },
        {
          contractAddress,
          method,
          args = [],
          options = {},
        },
      ) {
        const contract = await dispatch('initTokenSaleContractIfNeeded', contractAddress);

        const { decodedResult } = await contract.methods[method](...args, options);
        return decodedResult;
      },
      async tokenVotingMethod(
        { dispatch },
        {
          contractAddress,
          method,
          args = [],
          options = {},
        },
      ) {
        const contract = await dispatch('initTokenVotingContractIfNeeded', contractAddress);

        const { decodedResult } = await contract.methods[method](...args, options);
        return decodedResult;
      },
    };
  }
}
