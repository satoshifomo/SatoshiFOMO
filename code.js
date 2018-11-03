async buykeyAction(req: Request, res: Response, next: NextFunction)
{
    console.log("---------------buykey---------------")
    let returnbody: any  = createReturnBody();
    try
    {
        returnbody = await roundInfoDbHelper.getRoundInfo(FundGame.currRoundID);
        let nowtimestamp = new Date().getTime();
        let gameStartTime = returnbody.bufferdata.starttime;
        let gameEndTime = returnbody.bufferdata.endtime;
        let data = await utils.requestData(req);
        let jsondata = JSON.parse(data);
        let in_txid = jsondata.txid;
        returnbody.bufferdata = {};
        if (nowtimestamp < gameStartTime)
        {
            returnbody.returnvalue = -1;
            returnbody.returnmsg = "The game has not started yet"
            returnbody.bufferdata = {}
        } else if (FundGame.countdownTime <= 0 || nowtimestamp >= gameEndTime)
        {
            returnbody.returnvalue = -1;
            returnbody.returnmsg = "The game is over"
            returnbody.bufferdata = {}
        } else // game running
        {
            let in_userid = jsondata.userid;
            let in_userAddress = jsondata.firstAddress;
            let isDoubleSpend = false;
            if (in_userid)
            {
                let playerRoundInfoReturnbody: any = await playerRoundDbHelper.getAllUserRoundInfo(FundGame.currRoundID);
                if (playerRoundInfoReturnbody.returnvalue == 0)
                {
                    let userTxArr = playerRoundInfoReturnbody.bufferdata;
                    for (let i = 0; i < userTxArr.length; i++)
                    {
                        if ((userTxArr[i].txid).indexOf(in_txid) != -1)
                        {
                            isDoubleSpend = true;
                            break;
                        }
                    }
                } else
                {
                    isDoubleSpend = false
                }
                let buykeyTxidRet: any = await buykeytxidDbHelper.get_bytxid(in_txid);
                if (buykeyTxidRet.returnvalue == 0)
                {
                    isDoubleSpend = false
                } else
                {
                    isDoubleSpend = true
                }

                if (isDoubleSpend)
                {
                    returnbody.returnvalue = -1;
                    returnbody.returnmsg = "This transaction id has been processed, please do not send it again!"
                    returnbody.bufferdata = {}
                } else
                {

                    let in_inviteCode: string;
                    let getInviteCodeReturnbody: any = await userDbHelper.get_userInviteCode(in_userid);
                    if (getInviteCodeReturnbody.returnvalue != 0)
                    {
                        in_inviteCode = "";
                    } else
                    {
                        in_inviteCode = getInviteCodeReturnbody.bufferdata.inviteCode;
                    }
                    let inviteCodeOwnerAddress: string = "";
                    let inviteCodeOwnerUserid: number;
                    let isInvite: boolean = false;
                    if (!common.isNullOrUndefinedOrEmpty(in_inviteCode))
                    {
                        isInvite = true;
                        let ownerAddressReturnbody: any = await addressDbHelper.get_inviteCodeOwnerAddress(in_inviteCode);
                        if (ownerAddressReturnbody.returnvalue != 0)
                        {
                            isInvite = false;
                        } else
                        {
                            inviteCodeOwnerAddress = ownerAddressReturnbody.bufferdata.inviteCodeOwnerAddress;
                            inviteCodeOwnerUserid = ownerAddressReturnbody.bufferdata.ownerUserid;
                        }
                    } else
                    {
                        isInvite = false;
                    }
                    let buykeyaddress: string;
                    let finalAwardAddress: string;
                    let officialAwardAddresses: string;
                    let lotteryAddresses: string;
                    let multisigAddress: string;
                    let buykeyAmount: number;
                    let buykeyValue: number;
                    let privilegeUserAddr: string = "";
                    let privilegeRet: any = await privilegeDbHelper.get_privilegeInfo(FundGame.currRoundID);
                    let buykeyaddressReturnbody: any = await addressDbHelper.get_current_addresses(FundGame.currRoundID);
                    if (buykeyaddressReturnbody.returnvalue == 0)
                    {
                        let addrdata = buykeyaddressReturnbody.bufferdata;
                        buykeyaddress = addrdata.buykeyaddresses;
                        multisigAddress = addrdata.multisigaddress;
                        finalAwardAddress = addrdata.finalawardaddresses;
                        officialAwardAddresses = addrdata.officialawardaddresses;
                        lotteryAddresses = addrdata.lotteryaddresses;
                    }
                    await common.sleep(250)
                    let buykeytxidCheckRet: any = await buykeytxidDbHelper.get_bytxid(in_txid)
                    if (buykeytxidCheckRet.returnvalue == 0)
                    {
                        await common.getTxidInfo(in_txid)
                            .then(async (response: any) =>
                            {
                                let res = JSON.parse(response);
                                console.log('----------------Query the purchased transaction txid---------------------')
                                let isTxValid: Boolean = false;
                                for (let key of res.vout)
                                {
                                    if (key.value > 0 && key.scriptPubKey.addresses[0].indexOf(FundGame.buykeyaddress) != -1)
                                    {
                                        isTxValid = true;
                                        buykeyValue = key.value * 1e8; // the unit satoshis
                                    }
                                }
                                if (!isTxValid)
                                {
                                    returnbody.returnvalue = -1;
                                    returnbody.returnmsg = "Illegal id!"
                                    returnbody.bufferdata = {}
                                } else
                                {
                                    buykeyAmount = Number((buykeyValue / FundGame.keyPrice).toFixed(2)); // Number of keys purchased
                                    let playerInvestAmount: number;
                                    let bukeytime = res.time * 1000;
                                    let payToFinalAwardValue = Math.floor(buykeyValue * 0.15);
                                    let payToInviteCodeOwnerValue = Math.floor(buykeyValue * 0.10);
                                    let payToLotteryValue = Math.floor(buykeyValue * 0.02);
                                    let payToOfficialAwardValue = Math.floor(buykeyValue * 0.08);
                                    let aggregateOpreturn = JSON.stringify({ "flag": "satoshigame", "item": "mergeUTXO", "time": new Date().getTime() });
                                    await common.aggregateUTXO(FundGame.finalawardaddress, new FundGame().mnemonicOfFinalawardaddress, aggregateOpreturn, FundGame.finalAwardAddressTxidStore);
                                    await common.aggregateUTXO(FundGame.lotteryaddress, new FundGame().mnemonicOfLotteryaddress, aggregateOpreturn, FundGame.lotteryAddressTxidStore);
                                    if (buykeyValue >= 29999)
                                    {
                                        await common.getAddrUtxo(buykeyaddress)
                                            .then(async (res: any) =>
                                            {
                                                let result = JSON.parse(res)
                                                let vinNum = [];
                                                let originalAmount = 0;

                                                for (let i = result.length - 1; i >= 0; i--)
                                                {
                                                    if (result[i].satoshis > 0)
                                                    {
                                                        if (result[i].satoshis >= Math.floor(buykeyValue * 0.25) + 1000)
                                                        {
                                                            originalAmount += result[i].satoshis  //  Overlay does not cost utxo
                                                            vinNum.push(i)
                                                            break
                                                        }
                                                    }
                                                }

                                                if (vinNum.length < 1)
                                                {
                                                    for (let i = result.length - 1; i >= 0; i--)
                                                    {
                                                        if (result[i].satoshis > 0)
                                                        {
                                                            originalAmount += result[i].satoshis 
                                                            vinNum.push(i)
                                                        }

                                                        if (originalAmount >= Math.floor(buykeyValue * 0.25) + 1000)
                                                        {
                                                            break
                                                        }
                                                    }
                                                }
                                                let transactionBuilder = new this.BITBOX.TransactionBuilder(FundGame.network);
                                                for (let i = 0; i < vinNum.length; i++)
                                                {
                                                    transactionBuilder.addInput(result[vinNum[i]].txid, result[vinNum[i]].vout)
                                                }
                                                let opReturn = JSON.stringify({ "flag": "satoshigame", "item": "buykey", "keyamount": buykeyAmount, "buykeytime": bukeytime, txid: in_txid });
                                                let str = opReturn;
                                                let buf2 = new Buffer(str)
                                                let opreturnData = this.BITBOX.Script.encode([
                                                    this.BITBOX.Script.opcodes.OP_RETURN,
                                                    buf2
                                                ]);
                                                transactionBuilder.addOutput(opreturnData, 0);
                                                let opReturnLength = str.replace(/[\u0391-\uFFE5]/g, 'aaa').length + 2; 
                                                let byteCount: number;
                                                if (isInvite == true)
                                                {
                                                    byteCount = this.BITBOX.BitcoinCash.getByteCount({ P2PKH: vinNum.length }, { P2PKH: 5 }) + opReturnLength;
                                                } else
                                                {
                                                    byteCount = this.BITBOX.BitcoinCash.getByteCount({ P2PKH: vinNum.length }, { P2PKH: 5 }) + opReturnLength;
                                                }
                                                let giveMeChange: number;
                                                if (isInvite == true)
                                                {
                                                    giveMeChange = originalAmount - byteCount - payToInviteCodeOwnerValue - payToFinalAwardValue;
                                                    if (privilegeRet.returnvalue == 0)
                                                    {
                                                        for (let key of privilegeRet.bufferdata)
                                                        {
                                                            if (key.privilegecode == in_inviteCode)
                                                            {
                                                                giveMeChange = originalAmount - byteCount - payToInviteCodeOwnerValue - payToFinalAwardValue;
                                                            }
                                                        }
                                                    }

                                                } else
                                                {
                                                    giveMeChange = originalAmount - byteCount - payToLotteryValue - payToOfficialAwardValue - payToFinalAwardValue;
                                                }

                                                transactionBuilder.addOutput(finalAwardAddress, payToFinalAwardValue);
                                                transactionBuilder.addOutput(buykeyaddress, giveMeChange);
                                                if (isInvite == true)
                                                {
                                                    if (privilegeRet.returnvalue == 0)
                                                    {
                                                        for (let key of privilegeRet.bufferdata)
                                                        {

                                                            if (key.privilegecode == in_inviteCode)
                                                            {
                                                                privilegeUserAddr = key.legacyaddr
                                                            }
                                                        }
                                                    }
                                                    if (!common.isNullOrUndefinedOrEmpty(privilegeUserAddr))
                                                    {
                                                        transactionBuilder.addOutput(in_userAddress, payToLotteryValue); 
                                                        transactionBuilder.addOutput(privilegeUserAddr, payToOfficialAwardValue);
                                                    } else
                                                    {
                                                        transactionBuilder.addOutput(inviteCodeOwnerAddress, payToInviteCodeOwnerValue)
                                                    }
                                                } else
                                                {
                                                    // No invitation code
                                                    transactionBuilder.addOutput(lotteryAddresses, payToLotteryValue); // 2% to the lottery pool
                                                    transactionBuilder.addOutput(officialAwardAddresses, payToOfficialAwardValue);
                                                }

                                                let e = new FundGame().mnemonicOfBuykeyAddress;
                                                let rootSeed = this.BITBOX.Mnemonic.toSeed(e);
                                                // master HDNode
                                                let masterHDNode = this.BITBOX.HDNode.fromSeed(rootSeed, FundGame.network);
                                                let prk = masterHDNode.derivePath(`m/44'/145'/0'/0/0`);
                                                // keypair
                                                let keyPair = this.BITBOX.HDNode.toKeyPair(prk);
                                                // sign w/ HDNode
                                                let redeemScript;
                                                for (let i = 0; i < vinNum.length; i++)
                                                {
                                                    transactionBuilder.sign(i, keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, result[vinNum[i]].satoshis);
                                                }
                                                let tranferValue: number;
                                                if (isInvite)
                                                {
                                                    tranferValue = payToFinalAwardValue + payToInviteCodeOwnerValue;
                                                } else
                                                {
                                                    tranferValue = payToFinalAwardValue + payToLotteryValue + payToOfficialAwardValue;
                                                }

                                                // build tx
                                                let tx = transactionBuilder.build();
                                                let hex = tx.toHex()
                                                // Sending a transaction
                                                await common.sendRawTransaction(hex).then(async (result: any) =>
                                                {
                                                    console.log('----------------Send official auto-transfer transactions----------------------')
                                                    if (result.length >= 64 && result.indexOf("txid") != -1)
                                                    {
                                                        let getPlayerRoundInfoReturnbody: any = await playerRoundDbHelper.getPlayerRoundInfo(FundGame.currRoundID, in_userid);
                                                        if (getPlayerRoundInfoReturnbody.returnvalue == 0)
                                                        {
                                                            // The user has previously purchased the key, in two cases.
                                                            // 1.Already in the list of multiple signature candidates
                                                            // 2.Did not enter the list of candidates before
                                                            let getCandidateUserInfoReturnbody: any = await userDbHelper.get_candidateUserInfo(FundGame.currRoundID, in_userid);
                                                            if (getCandidateUserInfoReturnbody.returnvalue == 0)
                                                            {
                                                                // 1.Updated multi-signal candidate information in the multi-signature candidate list
                                                                await userDbHelper.update_multisigUser(FundGame.currRoundID, in_userid, buykeyValue);
                                                            } else
                                                            {
                                                                // 2.Did not enter the list of candidates before, if the total investment amount meets the requirements, then join the list of candidates
                                                                playerInvestAmount = getPlayerRoundInfoReturnbody.bufferdata.investamount;
                                                                let userAllInvestAmount = buykeyValue + playerInvestAmount;
                                                                if (userAllInvestAmount >= FundGame.multisigCandidateReferValue)
                                                                {
                                                                    // Join the multi-signature candidate pool
                                                                    await userDbHelper.add_multisigCandidater(FundGame.currRoundID, in_userid, userAllInvestAmount);
                                                                }
                                                            }
                                                        } else
                                                        {
                                                            // User did not purchase the key before
                                                            if (buykeyValue >= FundGame.multisigCandidateReferValue)
                                                            {
                                                                await userDbHelper.add_multisigCandidater(FundGame.currRoundID, in_userid, buykeyValue);
                                                            }
                                                        }
                                                        let officialOpreturnTxid = JSON.parse(result).txid
                                                        await officialOpreturnDbHelper.add_officialOpreturnData(FundGame.currRoundID, officialOpreturnTxid, bukeytime, in_txid, buykeyAmount,in_userid)
                                                        FundGame.addCountdownTime(buykeyAmount);
                                                        FundGame.changeKeyPrice(buykeyAmount); // Increase the price of the key after purchasing the key
                                                        FundGame.changeTotalPurchaseAmount(buykeyValue); // Update the total amount of the purchase key
                                                        FundGame.changeTotalKeys(buykeyAmount); // Update the total number of keys
                                                        FundGame.changeLastPlayerID(in_userid);
                                                        FundGame.changeWiningNumber(buykeyValue);
                                                        FundGame.ChangeBonusReferTotalAmount(buykeyValue);
                                                        FundGame.fundamount += Math.floor(buykeyValue * 0.75 - byteCount); // Record the new total
                                                        
                                                        let nowtime = new Date().getTime() / 1000;
                                                        let countdownDatetime = FundGame.countdownTime + Math.ceil(nowtime);
                                                        let datestring = new Date(countdownDatetime * 1000).toLocaleString();
                                                        returnbody = await playerRoundDbHelper.addOrUpdate_currRoundPlayerInfo(FundGame.currRoundID, in_userid, buykeyValue, buykeyAmount, in_txid);
                                                        returnbody.bufferdata.countdownTimestamp = countdownDatetime;
                                                        returnbody.bufferdata.countdownDatetime = datestring;
                                                        FundGame.changeFinalAwardAmount(buykeyValue); // Update the total prize money of the final prize pool
                                                        FundGame.changeLotteryAmount(buykeyValue, isInvite);

                                                        await roundInfoDbHelper.updateRoundInfo(FundGame.currRoundID, FundGame.countdownTime, FundGame.keyPrice, FundGame.currTotalKeys, FundGame.fundamount, "", FundGame.finalAwardAmount, FundGame.lastPlayerID, FundGame.totalPurchaseAmount, FundGame.lotteryAmount, FundGame.winingNumber, FundGame.bonusReferTotalAmount, FundGame.multisigaddressamount);
                                                        await buykeytxidDbHelper.add_buykeyTxid(FundGame.currRoundID, in_txid, 0);
                                                        await playerRoundDbHelper.updateAllUserWithDraw(FundGame.currRoundID)
                                                        await addressDbHelper.updateTxidstore(FundGame.currRoundID, "buykeyaddresses", FundGame.buykeyAddressTxidStore);
                                                        await playerRoundDbHelper.updatePlayerInviteIncome(FundGame.currRoundID, inviteCodeOwnerUserid, payToInviteCodeOwnerValue);
                                                        returnbody.bufferdata = common.toJsonValue({ "code": 200, "msg": "buy key success!" });
                                                    } else
                                                    {
                                                        returnbody.returnvalue = -1
                                                        returnbody.bufferdata = common.toJsonValue({ "code": 500, "msg": result, buykeyTxid: in_txid });
                                                        
                                                    }
                                                }).catch((err: any) =>
                                                {
                                                    console.log(err)
                                                })

                                            }, (err: any) =>
                                                {
                                                    console.log(err)
                                                })
                                    } else
                                    {
                                        returnbody.returnvalue = -1;
                                        returnbody.bufferdata = common.toJsonValue({ "code": 400, "msg": "Invalid txid!BuykeyValue<30000" });
                                    }
                                }
                            })
                            .catch((err: any) => console.log(err))
                    } else
                    {
                        returnbody.returnvalue = -1;
                        returnbody.returnmsg = "This txid is handled by reissue procedure!";
                    }
                }
            } else
            {
                returnbody.returnvalue = -1;
                returnbody.returnmsg = "userid is error";
            }
        }
    }
    catch (e)
    {
        returnbody.returnvalue = -1;
        returnbody.returnmsg = e;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf8" });
    res.write(JSON.stringify(returnbody));
    res.end();
}

async getBonusBykeys(req: Request, res: Response, next: NextFunction)
{
    let returnbody:any = createReturnBody();
    try {
        let data = await utils.requestData(req);
        let jsondata = JSON.parse(data);
        let in_userid = jsondata.userid;
        let userFirstAddress: string;
        returnbody = await roundInfoDbHelper.getRoundInfo(FundGame.currRoundID);
        let allKeysAmount = returnbody.bufferdata.keys;
        let buykeyaddress: string;
        let buykeyaddressReturnbody: any = await addressDbHelper.get_current_addresses(FundGame.currRoundID);
        let unwithdrawInOtherRoundRet: any = await playerRoundDbHelper.getUserUnwithdrawInOtherRound(FundGame.currRoundID, in_userid);
        let unwithdrawInOtherRound = unwithdrawInOtherRoundRet.bufferdata.unwithdraw;
        if (buykeyaddressReturnbody.returnvalue == 0)
        {
            let addrdata = buykeyaddressReturnbody.bufferdata;
            buykeyaddress = addrdata.buykeyaddresses;
        }
        if (common.isNullOrUndefinedOrEmpty(in_userid))
        {
            returnbody.returnvalue = -1;
            returnbody.returnmsg = "No such user information";
        } else
        {
            returnbody = await userDbHelper.get_userInfo(in_userid);
            if (returnbody.returnvalue != 0)
            {
                returnbody.returnvalue = -1;
                returnbody.returnmsg = "This user does not exist"
            } else
            {
                userFirstAddress = returnbody.bufferdata.firstaddress;
                returnbody = await playerRoundDbHelper.getPlayerRoundInfo(FundGame.currRoundID, in_userid);
                if (returnbody.returnvalue != 0)
                {
                    if (unwithdrawInOtherRound < 1000)
                    {
                        returnbody.returnvalue = -1;
                        returnbody.returnmsg = "This user has not purchased a key or the bonus amount is too low"
                    } else
                    {
                        let transferdata: common.transferParams = {
                            from: buykeyaddress,
                            to: [userFirstAddress],
                            e: new FundGame().mnemonicOfBuykeyAddress,
                            BITBOX: this.BITBOX,
                            hasChange: true,
                            txidStore: FundGame.buykeyAddressTxidStore,
                            payToValue: unwithdrawInOtherRound,
                            opReturnData: JSON.stringify({ "flag": "satoshigame", "item": "withdraw", "withdrawtime": new Date().getTime(), "otherRound": unwithdrawInOtherRound })
                        }
                        await common.transferAccount(transferdata)
                            .then(async (res: any) =>
                            {
                                await utils.sendRawTransaction(res.hex)
                                    .then(async (result: any) =>
                                    {
                                        console.log('----------------Send the official fund pool to reissue the dividend automatic transfer transaction----------------------')
                                        console.log('The official fund pool reissue dividend transaction result is', result);
                                        if (result.length >= 64 && result.indexOf("txid") != -1)
                                        {
                                            await playerRoundDbHelper.updateUserWithdrawOfOtherRound(FundGame.currRoundID, in_userid)
                                            returnbody.returnvalue = 0;
                                            returnbody.bufferdata = common.toJsonValue({ "code": 200, "msg": "reissue bonus success", "value": unwithdrawInOtherRound });
                                        } else
                                        {
                                            returnbody.bufferdata = common.toJsonValue({ "code": 500, "msg": result });
                                            returnbody.returnvalue = -1;
                                        }

                                    }, (err: any) =>
                                        {
                                            console.log(err)
                                        })
                            })
                            .catch((err) =>
                            {
                                console.log(err)
                            })
                    }
                    
                } else
                {
                    let userKeysAmount = returnbody.bufferdata.keysamount;
                    let userWithdraw = returnbody.bufferdata.withdraw;
                    let userInvestmentAmount = returnbody.bufferdata.investamount;
                    let userCanWithdrawValue = Math.floor(userKeysAmount / allKeysAmount * FundGame.bonusReferTotalAmount);
                    if (unwithdrawInOtherRound + userCanWithdrawValue < 5000)
                    {
                        returnbody.returnvalue = -1;
                        returnbody.returnmsg = "The amount that can be collected is less than 5000 Satoshi!"
                    } else
                    {
                        if (userCanWithdrawValue <= userInvestmentAmount * 3)
                        {
                            if (userWithdraw < userCanWithdrawValue)
                            {
                                let transferdata: common.transferParams = {
                                    from: buykeyaddress,
                                    to: [userFirstAddress],
                                    e: new FundGame().mnemonicOfBuykeyAddress,
                                    BITBOX: this.BITBOX,
                                    hasChange: true,
                                    txidStore: FundGame.buykeyAddressTxidStore,
                                    payToValue: userCanWithdrawValue - userWithdraw + unwithdrawInOtherRound,
                                    opReturnData: JSON.stringify({ "flag": "satoshigame", "item": "withdraw", "withdrawtime": new Date().getTime(), "otherRound": unwithdrawInOtherRound })
                                }
                                await common.transferAccount(transferdata)
                                    .then(async (res: any) =>
                                    {
                                        await utils.sendRawTransaction(res.hex)
                                            .then(async (result: any) =>
                                        {
                                            console.log('----------------Send an official fund pool dividend redemption transaction----------------------')
                                            console.log('The official fund pool dividend trading result is', result);
                                            if (result.length >= 64 && result.indexOf("txid") != -1)
                                            {

                                                await playerRoundDbHelper.updateUserWithdrawOfOtherRound(FundGame.currRoundID, in_userid)
                                                FundGame.fundamount = FundGame.fundamount - (userCanWithdrawValue - userWithdraw - res.byteCount);
                                                FundGame.buykeyAddressTxidStore = res.txidStore;
                                                await addressDbHelper.updateTxidstore(FundGame.currRoundID, "buykeyaddresses", FundGame.buykeyAddressTxidStore)
                                                await playerRoundDbHelper.updateUserWithDraw(FundGame.currRoundID, in_userid, userCanWithdrawValue);
                                                await roundInfoDbHelper.updateFundAmount(FundGame.currRoundID, FundGame.fundamount);
                                                returnbody.bufferdata = common.toJsonValue({ "code": 200, "msg": "get bonus success", "value": userCanWithdrawValue - userWithdraw - res.byteCount });
                                                if (userCanWithdrawValue - userWithdraw > FundGame.withdrawNoticeReferValue)
                                                {
                                                    let noticeData = { "address": userFirstAddress, "value": userCanWithdrawValue - userWithdraw }
                                                    for (let key in FundGame.AllUserSocket)
                                                    {
                                                        FundGame.AllUserSocket[key].broadcast.emit("withdraw_notice", noticeData)
                                                    }
                                                }
                                            } else
                                            {
                                                returnbody.bufferdata = common.toJsonValue({ "code": 500, "msg": result });
                                                returnbody.returnvalue = -1;
                                            }
                                            
                                        }, (err: any) =>
                                            {
                                                console.log(err)
                                            })
                                    })
                                    .catch((err) =>
                                    {
                                        console.log(err)
                                    })
                            } else
                            {
                                returnbody.returnvalue = -1;
                                returnbody.returnmsg = "Has received bonus"
                            }
                        } else
                        {
                            if (userWithdraw <= userInvestmentAmount * 3)
                            {
                                let txidStoreReturnBody: any = await addressDbHelper.get_current_addresses(FundGame.currRoundID)
                                let txidStore = txidStoreReturnBody.bufferdata.buykeyaddressestxidstore
                                let transferdata: common.transferParams = {
                                    from: buykeyaddress,
                                    to: [userFirstAddress],
                                    e: new FundGame().mnemonicOfBuykeyAddress,
                                    BITBOX: this.BITBOX,
                                    txidStore: txidStore,
                                    hasChange: true,
                                    payToValue: userInvestmentAmount * 3 - userWithdraw + unwithdrawInOtherRound,
                                    opReturnData: JSON.stringify({ "flag": "satoshigame", "item": "withdraw", "withdrawtime": new Date().getTime(), "otherRound": unwithdrawInOtherRound})
                                }
                                await common.transferAccount(transferdata)
                                    .then(async (res: any) =>
                                    {
                                        await utils.sendRawTransaction(res.hex)
                                            .then(async (result: any) =>
                                        {
                                            console.log('----------------Send an official fund pool dividend redemption transaction----------------------')
                                            console.log('The result of the transaction is', result);
                                            if (result.length >= 64 && result.indexOf("txid") != -1)
                                            {
                                                await playerRoundDbHelper.updateUserWithdrawOfOtherRound(FundGame.currRoundID, in_userid)
                                                FundGame.fundamount = FundGame.fundamount - (userInvestmentAmount * 3 - userWithdraw - res.byteCount);
                                                await roundInfoDbHelper.updateFundAmount(FundGame.currRoundID, FundGame.fundamount);
                                                await playerRoundDbHelper.updateUserWithDraw(FundGame.currRoundID, in_userid, userInvestmentAmount * 3);
                                                returnbody.bufferdata = common.toJsonValue({ "code": 200, "msg": "get bonus success", "value": userInvestmentAmount * 3 - userWithdraw });
                                                if (userInvestmentAmount * 3 - userWithdraw > FundGame.withdrawNoticeReferValue)
                                                {
                                                    let noticeData = { "address": userFirstAddress, "value": userInvestmentAmount * 3 - userWithdraw }
                                                    for (let key in FundGame.AllUserSocket)
                                                    {
                                                        FundGame.AllUserSocket[key].broadcast.emit("withdraw_notice", noticeData)
                                                    }
                                                }

                                            } else
                                            {
                                                returnbody.bufferdata = common.toJsonValue({ "code": 500, "msg": result });
                                                returnbody.returnvalue = -1;
                                            }
                                            
                                        }, (err: any) =>
                                            {
                                                console.log(err)
                                            })
                                    })
                                    .catch((err) =>
                                    {
                                        console.log(err)
                                    })
                            } else
                            {
                                returnbody.returnvalue = -1;
                                returnbody.returnmsg = "Has reached the upper limit!"
                            }
                        }
                    }
                    
                }
            }
        }
    } catch (e) {
        returnbody.returnvalue = -1;
        returnbody.returnmsg = e
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf8" });
    res.write(JSON.stringify(returnbody));
    res.end();
}

export async function transferAccount(data: transferParams):Promise<object>
{
    let hex: string;
    let byteCount: number; 
    let network = FundGame.network;
    await getAddrUtxo(data.from)
    .then(async (res: any) =>
    {
        let result = JSON.parse(res)
        let AddressBalance;
        if (!data.hasChange)
        {
            AddressBalance = await getBalance(data.from)
            data.payToValue = AddressBalance;
        }
        let vinNum = []
        let originalAmount = 0
        if (data.isNeedConfirm == true)
        {
            for (let i = result.length - 1; i >= 0; i--)
            {
                if (result[i].satoshis > 0)
                {
                    if (result[i].satoshis >= data.payToValue + 1000 && result[i].confirmations>0)
                    {
                        originalAmount += result[i].satoshis  
                        vinNum.push(i)
                        break
                    }
                }
            }
            if (vinNum.length < 1)
            {
                for (let i = result.length - 1; i >= 0; i--)
                {
                    if (result[i].satoshis > 0)
                    {
                        originalAmount += result[i].satoshis
                        vinNum.push(i)
                    }
                    if (!data.hasChange)
                    {
                        if (originalAmount >= data.payToValue)
                        {
                            break
                        }
                    } else
                    {
                        if (originalAmount >= data.payToValue + 700)
                        {
                            break
                        }
                    }
                }
            }
        } else
        {
            for (let i = result.length - 1; i >= 0; i--)
            {
                if (result[i].satoshis > 0)
                {
                    if (result[i].satoshis >= data.payToValue + 1000)
                    {
                        originalAmount += result[i].satoshis
                        vinNum.push(i)
                        break
                    }
                }
            }
            if (vinNum.length < 1)
            {
                for (let i = result.length - 1; i >= 0; i--)
                {
                    if (result[i].satoshis > 0)
                    {
                        originalAmount += result[i].satoshis
                        vinNum.push(i)
                    }
                    if (!data.hasChange)
                    {
                        if (originalAmount >= data.payToValue)
                        {
                            break
                        }
                    } else
                    {
                        if (originalAmount >= data.payToValue + 700)
                        {
                            break
                        }
                    }
                }
            }
        }
        let transactionBuilder = new data.BITBOX.TransactionBuilder(network)
        for (let i = 0; i < vinNum.length; i++)
        {
            transactionBuilder.addInput(result[vinNum[i]].txid, result[vinNum[i]].vout)
        }
        let opReturn = data.opReturnData;
        let opreturnData: any;
        let opReturnLength: number;
        if (!isNullOrUndefinedOrEmpty(opReturn))
        {
            let str = opReturn;
            let buf2 = new Buffer(str)
            opreturnData = data.BITBOX.Script.encode([
                data.BITBOX.Script.opcodes.OP_RETURN,
                buf2
            ])
            opReturnLength = str.replace(/[\u0391-\uFFE5]/g, 'aaa').length;
            transactionBuilder.addOutput(opreturnData, 0);
        } else
        {
            opReturnLength = 0;
        }
        if (data.extraBytecount)
        {
            byteCount = data.BITBOX.BitcoinCash.getByteCount({ P2PKH: vinNum.length }, { P2PKH: data.to.length + 2 }) + opReturnLength + data.extraBytecount + vinNum.length * 200;
        } else
        {
            byteCount = data.BITBOX.BitcoinCash.getByteCount({ P2PKH: vinNum.length }, { P2PKH: data.to.length + 2 }) + opReturnLength;
        }
        for (let key of data.to)
        {
            transactionBuilder.addOutput(key, Math.floor((data.payToValue - byteCount) / data.to.length));
        }
        if (data.hasChange == true)
        {
            transactionBuilder.addOutput(data.from, originalAmount - data.payToValue);
        }

        let rootSeed = data.BITBOX.Mnemonic.toSeed(data.e);
        // master HDNode
        let masterHDNode = data.BITBOX.HDNode.fromSeed(rootSeed, FundGame.network);
        let prk = masterHDNode.derivePath(`m/44'/145'/0'/0/0`);
        // keypair
        let keyPair = data.BITBOX.HDNode.toKeyPair(prk);
        // sign w/ HDNode
        let redeemScript;
        for (let i = 0; i < vinNum.length; i++)
        {
            transactionBuilder.sign(i, keyPair, redeemScript, transactionBuilder.hashTypes.SIGHASH_ANYONECANPAY | transactionBuilder.hashTypes.SIGHASH_ALL, result[vinNum[i]].satoshis);
        }
        let tx = transactionBuilder.build();
        hex = tx.toHex();
    }, (err: any) =>
    {
        console.log(err)
    })

    return { "hex": hex, "byteCount": byteCount, "txidStore": data.txidStore, "transfervalue": (data.payToValue - byteCount) / data.to.length };
}
export async function getBalance(addr: string): Promise<number>
{
    let balance = await utils.httpRequest(`${fundgameService.apiprefix_addr}/${addr}/balance`);
    let unconfirmedBalance = await utils.httpRequest(`${fundgameService.apiprefix_addr}/${addr}/unconfirmedBalance`);
    return Number(balance) + Number(unconfirmedBalance);
}

async function getBlockInfo(blockhash: string, retries = 20): Promise<any>
{
    var result;
    var count = 0;

    while (result == undefined)
    {
        result = await utils.httpRequest(`${fundgameService.apiprefix_block}/${blockhash}`);
        count++;
        if (count > retries)
            throw new Error("getBlockInfo endpoint experienced a problem");
        await sleep(250);
    }
    return result;
}
async function getTxidInfo(txid: string, retries = 20): Promise<any>
{
    var result;
    var count = 0;

    while (result == undefined)
    {
        result = await utils.httpRequest(`${fundgameService.apiprefix_tx}/${txid}`);
        count++;
        if (count > retries)
            throw new Error("getTxidInfo endpoint experienced a problem");
        await sleep(250);
    }
    return result;
}
async function getAddrInfo(addr: string): Promise<any>
{
    return utils.httpRequest(`${fundgameService.apiprefix_addr}/${addr}`)
}
async function getAddrUtxo(addr: string): Promise<any>
{
    return utils.httpRequest(`${fundgameService.apiprefix_addr}/${addr}/utxo`)
}


async function sendRawTransaction(hex: string, retries = 20): Promise < string > {
    var result: string = "";
    var i = 0;
    while(result == "") {
        result = await utils.sendRawTransaction(hex);
        i++;
        if (i > retries)
            throw new Error("sendRawTransaction experienced a problem.")
        await sleep(250);
    }

    if (result.length < 64)
        console.log("An error occured while sending the transaction:\n" + result);
    return result;
}
async function aggregateUTXO(addr: string, addrmne: string, opReturnData: string, txidStore: string)
{
    var transferResult: string = "";
    let result: string = "";
    result = await getAddrUtxo(addr);
    let res = JSON.parse(result)
    let utxoCount = res.length
    console.log(`${addr}_utxoCount`, utxoCount)
    if (utxoCount >= 150)
    {
        console.log("merge UTXO")
        let data: transferParams = {
            from: addr,
            to: [addr],
            e: addrmne,
            BITBOX: BITBOX,
            txidStore: txidStore,
            hasChange: false,
            opReturnData: opReturnData,
            isNeedConfirm: true
        }
        await transferAccount(data)
            .then(async (res: any) =>
            {
                await utils.sendRawTransaction(res.hex)
                    .then(async (result: any) =>
                    {
                        console.log(`The merge result is`, result);
                        transferResult = result
                    }, (err: any) =>
                        {
                            console.log(err)
                        })
            })
            .catch((err) =>
            {
                console.log(err)
            })
    } 
}


