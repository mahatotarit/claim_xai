const ethers = require('ethers');
const tx_data = require('./data');
require('dotenv').config();
const events = require('events');
events.EventEmitter.defaultMaxListeners = 1000;

const readline = require('readline');

// =============================================================
(async()=>{

    // Input Data Variables
    let start_time,next_tx_diff,re_ca_tx,gasfee_required,gasfee_value, gasprice, gaslimit,gasfee_contract_diff, gasfee_sending_wallet_key, compromised_wallet_key, rpc_url;

    let provider;
    async function check_env_file_variable() {
        start_time = process.env.START_TIME.trim();
        gasfee_value = process.env.GASFEE_VALUE.trim();
        gasprice = process.env.GASPRICE.trim();
        gaslimit = process.env.GASLIMIT.trim();
        gasfee_contract_diff = process.env.GASFEE_CONTRACT_DIFF.trim();
        gasfee_sending_wallet_key = process.env.GASFEE_SENDING_WALLET_KEY.trim();
        compromised_wallet_key = process.env.COMPROMISED_WALLET_KEY.trim();
        rpc_url = process.env.RPC_URL.trim();
        gasfee_required = process.env.GASFEE_REQUIRED.trim();
        re_ca_tx = process.env.RE_CA_TX.trim();
        next_tx_diff = process.env.NEXT_TX_DIFF.trim();

        // Array of objects containing variable names and values
        let env_variables = [
            { name: "START_TIME", value: start_time },
            { name: "GASFEE_VALUE", value: gasfee_value },
            { name: "GASFEE_REQUIRED", value: gasfee_required },
            { name: "GASPRICE", value: gasprice },
            { name: "GASLIMIT", value: gaslimit },
            { name: "GASFEE_SENDING_WALLET_KEY", value: gasfee_sending_wallet_key },
            { name: "COMPROMISED_WALLET_KEY", value: compromised_wallet_key },
            { name: "RPC_URL", value: rpc_url },
            { name: "GASFEE_CONTRACT_DIFF", value: gasfee_contract_diff },
            { name: "RE_CA_TX", value: re_ca_tx },
            { name: "NEXT_TX_DIFF", value: next_tx_diff }

        ];

        // Check each variable
        env_variables.forEach(variable => {
            if (variable.value == null || variable.value == undefined || variable.value == "") {
                console.log(`ERROR: Enter the ${variable.name} of the .env file.`);
                process.exit(0);
            }
        });

        // check start time
        function is_valid_start_date(){
            let [hours, minutes, seconds] = start_time.split(':').map(Number);
            let date = new Date();
            date.setHours(hours, minutes, seconds, 0);

            if (isNaN(date.getTime())) {
              console.log('ERROR: Invalid start_date.');
              process.exit(0);
            }
        }

        is_valid_start_date();

        // both wallet private key check
        function is_valid_private_key(_metamask_wallet_privatekey) {
            try {
              const wallet = new ethers.Wallet(_metamask_wallet_privatekey);
              wallet.address;
            } catch (error) {
              console.log('Invalid private key.');
              process.exit(0);
            }
        }
        is_valid_private_key(gasfee_sending_wallet_key);
        is_valid_private_key(compromised_wallet_key);

        // check rpc url , valid or not
        async function is_valid_rpc_url(providerUrl){
            try {
                if (providerUrl.startsWith('http') || providerUrl.startsWith('https')) {
                    provider = await new ethers.providers.JsonRpcProvider(providerUrl);
                } else if (providerUrl.startsWith('ws') || providerUrl.startsWith('wss')) {
                    provider = await new ethers.providers.WebSocketProvider(providerUrl);
                } else {
                    console.log('Invalid RPC URL scheme. Only http, https, ws, and wss are supported.');
                    process.exit(0);
                }
                await provider.getBlockNumber();
            } catch (error) {
                console.log(`Invalid RPC URL.`);
                process.exit(0);
            }
        }
        is_valid_rpc_url(rpc_url);

    }

    async function check_transactions_data(){

        async function check_contract_address(_address){
            try {
                const code = await provider.getCode(_address);

                if (code === '0x') {
                    console.log("ERROR: The address is not a contract or doesn't exist.");
                    process.exit(0);
                }
            } catch (error) {
                console.log('ERROR: checking the contract address:', _address);
                process.exit(0);
            }
        }

        async function check_abi_code(_abi){

            if (!_abi || _abi.length === 0) {
              console.log('The ABI is empty.');
              process.exit(0);
            }

            try {
              const iface = new ethers.utils.Interface(_abi);
            } catch (error) {
              console.error('The ABI is invalid: ' + _abi);
              process.exit(0);
            }
        }

        async function check_fun_exists_into_abi(_function_name,_abi_code,_pera){
            let contractInterface = await new ethers.utils.Interface(_abi_code);
            let functionName = _function_name;
            let parameters = _pera;

            try {
                let encodedData = await contractInterface.encodeFunctionData(functionName, parameters);
                return encodedData;
            } catch (error) {
                console.log('Check abi code and function name and parameters.');
                process.exit(0);
            }

        }

        for (let i = 0; i < tx_data.length; i++) {

          await check_contract_address(tx_data[i].contract);
          await check_abi_code(tx_data[i].abi);
          if(tx_data[i].is_hex_data == true || tx_data[i].is_hex_data == 'true'){
             return;
          }

          let hex_data = await check_fun_exists_into_abi(tx_data[i].data.function,tx_data[i].abi,tx_data[i].data.paremeter);
          tx_data[i].is_hex_data = true;
          tx_data[i].hex_data = hex_data;

        }

    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    await check_env_file_variable();
    await check_transactions_data();

    // set all provider and wallet for tx
    async function config_tx_details(){
      // all tx provider
      let tx_provider;
      async function set_provider() {
        try {
          if (rpc_url.startsWith('http') || rpc_url.startsWith('https')) {
            tx_provider = await new ethers.providers.JsonRpcProvider(rpc_url);
          } else {
            tx_provider = await new ethers.providers.WebSocketProvider(rpc_url);
          }
          console.log("Successfully connected to the network provider at " + rpc_url);

        } catch (error) {
          console.log('ERROR: Provider connecting error.');
          process.exit(0);
        }
      }

      // create gas fee wallet
      let gasfee_wallet;
      async function set_gas_fee_wallet() {
        try {
          gasfee_wallet = await new ethers.Wallet( gasfee_sending_wallet_key,  tx_provider);
          console.log('Gas fee wallet is ready for transactions.');
        } catch (error) {
          console.log('ERROR: Gas fee wallet creating error. ');
          process.exit(0);
        }
      }

      // create compromised wallet
      let compromised_wallet;
      async function set_compromised_wallet() {
        try {
          compromised_wallet = await new ethers.Wallet(compromised_wallet_key,tx_provider);
          console.log('Compromised wallet is ready for transactions.');
        } catch (error) {
          console.log('ERROR: Compromised wallet creating error.');
          process.exit(0);
        }
      }

      await set_provider();
      await set_gas_fee_wallet();
      await set_compromised_wallet();

      // gas fee required check
      async function check_gas_fee_required() {
        if (gasfee_required == true || gasfee_required == 'true') {
          return true;
        } else {
          return false;
        }
      }

      // left time
      async function get_start_time_difference() {
        let target_time = start_time;

        let [targetHours, targetMinutes, targetSeconds] = target_time.split(':').map(Number);
        let live_time = await new Date();
        let targ_time_format = await new Date();
        targ_time_format.setHours(targetHours, targetMinutes, targetSeconds, 0);

        if (
          targ_time_format.getHours() === targetHours &&
          targ_time_format.getMinutes() === targetMinutes &&
          targ_time_format.getSeconds() === targetSeconds
        ) {
        } else {
          console.log('ERROR: Target time is not valid time.');
          process.exit(0);
        }

        let differenceInMs = targ_time_format - live_time;

        return differenceInMs;
      }

      // get live time
      async function get_live_time(){
        let live_time = await new Date();
        return `${live_time.getUTCHours()}:${live_time.getUTCMinutes()}:${live_time.getUTCSeconds()}`;
      }

      // get nonce function
      async function getNonce(_address) {
        try {
          const nonce = await tx_provider.getTransactionCount(_address);
          return nonce;
        } catch (error) {
          console.error('Error getting nonce: ' + _address);
        }
      }

      // create gas fee sending wallet tx
      let gas_fee_tx_obj = {};
      let gasfee_wallet_nonce;
      async function create_gas_fee_tx_obj() {
        let higher_gas_price = parseFloat((Number(gasprice) * 1.5).toFixed(3));


        let gas_fee_amount = await ethers.utils.parseEther(gasfee_value); // ETH value
        let gasfeePrice = await ethers.utils.parseUnits(higher_gas_price.toString(), 'gwei'); // gwei value
        let gasfeeLimit = gaslimit; // gwei value
        let recipient_address = await compromised_wallet.address;

        gas_fee_tx_obj.to = recipient_address;
        gas_fee_tx_obj.value = gas_fee_amount;
        gas_fee_tx_obj.gasPrice = gasfeePrice;
        gas_fee_tx_obj.gasLimit = gasfeeLimit;
        gas_fee_tx_obj.nonce = gasfee_wallet_nonce;

        return gas_fee_tx_obj;
      }

      // create contract intrections tx
      let compromised_wallet_nonce;
      let contract_tx_array = [];
      async function create_contract_tx_obj(){

        contract_tx_array = [];

        for (let i = 0; i < tx_data.length; i++) {
          let ca_tx = {
            to: tx_data[i].contract,
            data: tx_data[i].hex_data,
            nonce: compromised_wallet_nonce,
            gasPrice: ethers.utils.parseUnits(gasprice.toString(), 'gwei'),
            gasLimit: gaslimit,
          };

          contract_tx_array.push(ca_tx);
          compromised_wallet_nonce = Number(compromised_wallet_nonce) + 1;
        };

      }

      // ================================================================================
      // transactions sending request
      async function controll_tx_request() {

        console.log(`Waiting for the target time (${start_time}) to send transaction requests. Time left- ${Math.floor((await get_start_time_difference()/1000) / 60)} Minutes`);

        let tx_int = setInterval(async () => {
           let left_time = await get_start_time_difference() / 1000; // seconds

           if(Math.floor(left_time) < 11 && Math.floor(left_time) > 9){
            console.log(`Transaction request will be sent in the next ${Math.floor(left_time)} seconds.`);
           }

           if(Math.floor(left_time) < 4 && Math.floor(left_time) > 0){
            console.log(Math.floor(left_time));
          }

          if(left_time < 0){
            clearInterval(tx_int);

            compromised_wallet_nonce = await getNonce(compromised_wallet.address);
            await create_contract_tx_obj();

            while (Number(re_ca_tx) > 0) {
                await burn();
                re_ca_tx = Number(re_ca_tx) - 1;
                if (Number(re_ca_tx) > 0) {
                    await create_contract_tx_obj();
                    await delay(next_tx_diff * 1000);
                }
            }

           }

        }, 1000);

      }

      gasfee_wallet_nonce = await getNonce(gasfee_wallet.address);
      await create_gas_fee_tx_obj();

      await controll_tx_request();

      //  burning function
      async function burn() {

        let gas_fe_re = await check_gas_fee_required();

        if (gas_fe_re) {
          try {
            let gasfeeResponse = gasfee_wallet.sendTransaction(gas_fee_tx_obj);
            console.log('GasFee transaction sent! Waiting for confirmation...' + "  Time: "+ await get_live_time());

            gasfee_wallet_nonce = gasfee_wallet_nonce + 1;
            await create_gas_fee_tx_obj();

          } catch (error) {
            console.log('ERROR: GasFee transactions error.');
            console.log(error);
          }

        }

        if (gas_fe_re) {
          await delay(gasfee_contract_diff*1000);
        }

        contract_tx_array.forEach( async (element) => {
           try {

              let transactionResponse = compromised_wallet.sendTransaction(element);
              console.log("Transactions request sent! " + element.to + "  Time: "+ await get_live_time());

            } catch (error) {
                console.log('ERROR: Contract tx error.');
            }
        });

      }

    }

    await config_tx_details();

})()