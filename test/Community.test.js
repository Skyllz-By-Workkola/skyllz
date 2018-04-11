require('events').EventEmitter.prototype._maxListeners = 100;

const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const web3 = new Web3(ganache.provider());

const CommunityJson = require('../ethereum/build/Community.json');
const VotingTokenJson = require('../ethereum/build/CommunityVotingToken.json');
const FactorySolutionJson = require('../ethereum/build/Factory.json');
const UCTJson = require('../ethereum/build/UniqueCombinationOfTalents.json');
const SolutionJson = require('../ethereum/build/Solution.json');

let Community = {
    interface: JSON.parse(CommunityJson.interface),
    bytecode: CommunityJson.bytecode,
    gasEstimate: '6000000'
};

let Voting = {
    interface: JSON.parse(VotingTokenJson.interface),
    bytecode: VotingTokenJson.bytecode,
    gasEstimate: '2000000'
};

let Factory = {
    interface: JSON.parse(FactorySolutionJson.interface),
    bytecode: FactorySolutionJson.bytecode,
    gasEstimate: '2000000'
};

let UCT = {
    interface: JSON.parse(UCTJson.interface),
    bytecode: UCTJson.bytecode,
    gasEstimate: '1000000'
};

let UCTRater = {
    interface: JSON.parse(UCTJson.interface),
    bytecode: UCTJson.bytecode,
    gasEstimate: '1000000'
}

let Solution = {
    interface: JSON.parse(SolutionJson.interface),
    bytecode: SolutionJson.bytecode,
    gasEstimate: '1000000'
};

let addresses = {
    manager: '',
    community: '',
    votingToken: '',
    partner: { wallet: '', factory: '' },
    student: { wallet: '', uct: '' },
    rater: { wallet: '', uct: '' },
    solution: ''
};

describe('Skyllz', () => {
    before(async () => {
        let accounts = await web3.eth.getAccounts();

        addresses.manager = accounts[0];
        addresses.partner.wallet = accounts[1];
        addresses.student.wallet = accounts[2];
        addresses.rater.wallet = accounts[3];
    });

    describe('Community contract', () => {
        before(async () => {
            Community.contract = await new web3.eth.Contract(Community.interface)
            .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
            .send({ from: addresses.manager, gas: Community.gasEstimate });

            addresses.community = Community.contract.options.address;
            addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

            Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);
        });

        it('Deploy', () => {
            assert.ok(Community.contract.options.address);
            assert.ok(addresses.votingToken);
        });

        it('Sender is the manager', async () => {
            let manager = await Community.contract.methods.manager().call();

            assert.equal(manager, addresses.manager);
        });

        it('Manager is a partner', async () => {
            let isPartner = await Community.contract.methods.isPartner(addresses.manager).call();

            assert.ok(isPartner);
        });

        it('Can apply to partner', async () => {
            let totalApplications = await Community.contract.methods.totalApplications().call();
            assert.equal(0, totalApplications);

            await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: "1000000" });

            totalApplications = await Community.contract.methods.totalApplications().call();
            assert.equal(1, totalApplications);
        });

        it('Can activate the voting system in a Application', async () => {
            await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: "1000000" });

            let application = await Community.contract.methods.applications(0).call();

            assert(!application.isActive);

            await Community.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });

            application = await Community.contract.methods.applications(0).call();

            assert(application.isActive);
        });

        describe('Community <> Partner (Application GOOD)', () => {
            before(async () => {
                Community.contract = await new web3.eth.Contract(Community.interface)
                .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
                .send({ from: addresses.manager, gas: Community.gasEstimate });

                addresses.community = Community.contract.options.address;
                addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

                Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);
            });

            it('Only actived partners can vote in application', async () => {
                await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: '1000000' });
                await Community.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });

                try {
                    await Community.contract.methods.voteInApplication(0, true).send({ from: addresses.partner.wallet, gas: '1000000' });
                    assert(false);
                } catch (e) {
                    assert(true);
                }

                let application = await Community.contract.methods.applications(0).call();

                assert.equal(application.applicant, addresses.partner.wallet);
                assert.equal(application.totalVotes, 0);

                await Community.contract.methods.voteInApplication(0, true).send({ from: addresses.manager, gas: '1000000' });

                application = await Community.contract.methods.applications(0).call();

                assert.equal(application.totalVotes, 1);
                assert.equal(application.votes, 1);
            });

            it('The application close properly (Good)', async () => {
                await Community.contract.methods.closeApplication(0).send({ from: addresses.manager, gas: '1000000' });

                let isPartner = await Community.contract.methods.isPartner(addresses.partner.wallet);
                let balance = await Voting.contract.methods.balanceOf(addresses.partner.wallet).call();

                assert(isPartner);
                assert(balance == 1);
            });

            it('Delete a partner properly', async () => {
                await Community.contract.methods.createDeleteApplication(addresses.partner.wallet).send({ from: addresses.partner.wallet, gas: '1000000' });

                await Community.contract.methods.enableApplication(1).send({ from: addresses.manager, gas: '1000000' });

                await Community.contract.methods.voteInApplication(1, true).send({ from: addresses.partner.wallet, gas: '1000000' });
                await Community.contract.methods.voteInApplication(1, true).send({ from: addresses.manager, gas: '1000000' });

                await Community.contract.methods.closeApplication(1).send({ from: addresses.manager, gas: '1000000' });

                let isPartner = await Community.contract.methods.isPartner(addresses.partner.wallet).call();
                let balance = await Voting.contract.methods.balanceOf(addresses.partner.wallet).call();

                assert(!isPartner);
                assert.equal(balance, 0);
            });
        });

        describe('Community <> Partner (Application BAD)', () => {
            before(async () => {
                Community.contract = await new web3.eth.Contract(Community.interface)
                .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
                .send({ from: addresses.manager, gas: Community.gasEstimate });

                addresses.community = Community.contract.options.address;
                addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

                Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);

                await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: '1000000' });
                await Community.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });
                await Community.contract.methods.voteInApplication(0, false).send({ from: addresses.manager, gas: '1000000' });
                await Community.contract.methods.closeApplication(0).send({ from: addresses.manager, gas: '1000000' });
            });

            it('The application close properly (Bad)', async () => {
                let application = await Community.contract.methods.applications(0).call();
                let isPartner = await Community.contract.methods.isPartner(addresses.partner.wallet).call();
                let balance = await Voting.contract.methods.balanceOf(addresses.partner.wallet).call();

                assert(!application.isActive);
                assert(application.isComplete);
                assert(!isPartner);
                assert.equal(balance, 0);
            });
        })

        describe('Community <> Partner (Request)', () => {
            before(async () => {
                Community.contract = await new web3.eth.Contract(Community.interface)
                .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
                .send({ from: addresses.manager, gas: Community.gasEstimate });

                addresses.community = Community.contract.options.address;
                addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

                Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);

                await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: '1000000' });
                await Community.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });
                await Community.contract.methods.voteInApplication(0, true).send({ from: addresses.manager, gas: '1000000' });
                await Community.contract.methods.closeApplication(0).send({ from: addresses.manager, gas: '1000000' });
            });

            it('A partner can open a request for a new skill', async () => {
                try {
                    await Community.contract.methods.createRequest("Solidity").send({ from: addresses.student.wallet, gas: '1000000' });
                    assert(false);
                } catch (e) {
                    assert(true);
                }

                try {
                    await Community.contract.methods.createRequest("Solidity").send({ from: addresses.partner.wallet, gas: '2000000' });
                    assert(true);
                } catch (e) {
                    assert(false);
                }

                try {
                    let request = await Community.contract.methods.requests(0).call();
                    assert.ok(request);
                } catch (e) {
                    assert(false);
                }

                let skills = await Community.contract.methods.getApprovedSkills().call();
                assert.equal(skills.length, 0);
            });

            it('Only partners can vote for request', async () => {
                try {
                    let request = await Community.contract.methods.requests(0).call();
                    assert.ok(request);
                    assert(!request.isComplete);
                } catch (e) {
                    assert(false);
                }

                try {
                    await Community.contract.methods.voteInRequest(0, true).send({ from: addresses.student.wallet, gas: '1000000' });
                    assert(false);
                } catch (e) {
                    assert(true);
                }

                try {
                    await Community.contract.methods.voteInRequest(0, true).send({ from: addresses.partner.wallet, gas: '1000000' });
                    await Community.contract.methods.voteInRequest(0, true).send({ from: addresses.manager, gas: '1000000' });
                    assert(true);
                } catch (e) {
                    assert(false);
                }
            });

            it('A request can close properly', async () => {
                await Community.contract.methods.closeRequest(0).send({ from: addresses.manager, gas: '1000000' });

                let skills = await Community.contract.methods.getApprovedSkills().call();
                assert.equal(skills.length, 1);
            });

            it('Can recovery the skill name of a approved skill', async () => {
                let skills = await Community.contract.methods.getApprovedSkills().call();
                let skillName = web3.utils.toAscii(skills[0]).replace(/[\0]+/, ''); // Remove the null characteres in string

                assert.equal(skillName, 'Solidity');
            });

            it('Delete a skill propperly', async () => {
                await Community.contract.methods.createDeleteRequest('Solidity').send({ from: addresses.partner.wallet, gas: '1000000' });

                let request = await Community.contract.methods.requests(1).call();

                assert.equal(request.skillName, 'Solidity');
                assert(request.isDelete);
                assert(!request.isComplete);

                await Community.contract.methods.voteInRequest(1, true).send({ from: addresses.partner.wallet, gas: '1000000' });
                await Community.contract.methods.voteInRequest(1, true).send({ from: addresses.manager, gas: '1000000' });

                let skills = await Community.contract.methods.getApprovedSkills().call();
                let nonDeleteSkillLenght = skills.length;

                await Community.contract.methods.closeRequest(1).send({ from: addresses.manager, gas: '1000000' });

                skills = await Community.contract.methods.getApprovedSkills().call();
                assert.equal(skills.length, nonDeleteSkillLenght - 1);
            });
        });

        describe('Community <> UCT', () => {
            before(async () => {
                Community.contract = await new web3.eth.Contract(Community.interface)
                .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
                .send({ from: addresses.manager, gas: Community.gasEstimate });

                addresses.community = Community.contract.options.address;
                addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

                Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);
            });

            it('Add new UCT', async () => {
                await Community.contract.methods.addWalletToCommunity(addresses.student.wallet).send({ from: addresses.manager, gas: '4000000' });
                addresses.student.uct = await Community.contract.methods.getUCTFromWallet(addresses.student.wallet).call({ from: addresses.manager });

                assert.ok(addresses.student.uct);
            });

            it('Check if a wallet has uct', async () => {
                let isWalletInCommunity = await Community.contract.methods.isWalletInCommunity(addresses.student.wallet).call({ from: addresses.manager });
                assert(isWalletInCommunity);

                isWalletInCommunity = await Community.contract.methods.isWalletInCommunity(addresses.manager).call({ from: addresses.manager });
                assert(!isWalletInCommunity);
            });

            it('Check if a UCT is valid', async () => {
                let isInCommunity = await Community.contract.methods.isUCTInCommunity(addresses.student.uct).call();

                assert(isInCommunity);

                isInCommunity = await Community.contract.methods.isUCTInCommunity(addresses.student.wallet).call();

                assert(!isInCommunity);
            });
        });
    });

    describe('Factory', () => {
        beforeEach(async () => {
            Community.contract = await new web3.eth.Contract(Community.interface)
            .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
            .send({ from: addresses.manager, gas: Community.gasEstimate });

            addresses.community = Community.contract.options.address;
            addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

            Factory.contract = await new web3.eth.Contract(Factory.interface)
            .deploy({ data: Factory.bytecode, arguments: [addresses.partner.wallet, addresses.community, 10] })
            .send({ from: addresses.manager, gas: Factory.gasEstimate });
        });

        it('Deploy a new factory', () => {
            assert.ok(Factory.contract.options.address);
        });

        it('The factory can be disabled', async () => {
            let isEnabled = await Factory.contract.methods.isEnabled().call();
            assert(isEnabled);

            try {
                await Factory.contract.methods.disableFactory().send({ from: addresses.student.wallet, gas: '1000000' });
                assert(false);
            } catch (e) {
                assert(true);
            }

            await Factory.contract.methods.disableFactory().send({ from: addresses.partner.wallet, gas: '1000000' });
            isEnabled = await Factory.contract.methods.isEnabled().call();

            assert(!isEnabled);
        });

        it('A factory disabled can be enabled', async () => {
            await Factory.contract.methods.disableFactory().send({ from: addresses.partner.wallet, gas: '1000000' });
            let isEnabled = await Factory.contract.methods.isEnabled().call();

            assert(!isEnabled);

            await Factory.contract.methods.enableFactory().send({ from: addresses.partner.wallet, gas: '4000000' });
            isEnabled = await Factory.contract.methods.isEnabled().call();

            assert(isEnabled);
        });


        it('Not deploy solution of a invalid UCT', async () => {
            let skills = [web3.utils.fromAscii('ethereum', 32), web3.utils.fromAscii('solidity', 32)];
            try {
                await Factory.contract.methods.deployNewSolution(skills, addresses.manager, 10).send({ from: addresses.partner.wallet, gas: '1000000' });
                assert(false);
            } catch (e) {
                assert(true);
            }
        });
    });

    describe('Factory <> Community', () => {
        beforeEach(async () => {
            Community.contract = await new web3.eth.Contract(Community.interface)
            .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
            .send({ from: addresses.manager, gas: Community.gasEstimate });

            addresses.community = Community.contract.options.address;
            addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

            Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);

            await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: '1000000' });
            await Community.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });
            await Community.contract.methods.voteInApplication(0, true).send({ from: addresses.manager, gas: '1000000' });
            await Community.contract.methods.closeApplication(0).send({ from: addresses.manager, gas: '1000000' });

            Factory.contract = await new web3.eth.Contract(Factory.interface)
            .deploy({ data: Factory.bytecode, arguments: [addresses.partner.wallet, addresses.manager, 10] })
            .send({ from: addresses.manager, gas: Factory.gasEstimate });
        });

        it('Add factory to partner', async () => {
            await Community.contract.methods.addFactoryToPartner(Factory.contract.options.address, addresses.partner.wallet)
            .send({ from: addresses.manager, gas: '1000000' });

            addresses.partner.factory = Factory.contract.options.address;

            let isValid = await Community.contract.methods.isValidFactory(addresses.partner.factory);

            assert(isValid);

            let factories = await Community.contract.methods.getFactoryAddressesOfPartner(addresses.partner.wallet).call();

            let promises = [];

            for (var i = 0; i < factories.length; i++) {
                promises.push(await Community.contract.methods.isValidFactory(factories[i]).call());

            }

            let isValidArray = await Promise.all(promises);

            for (var i = 0; i < isValidArray.length; i++) {
                assert(isValidArray[i]);
            }
        });

        it('Remove factory to partner', async () => {
            await Community.contract.methods.addFactoryToPartner(Factory.contract.options.address, addresses.partner.wallet)
            .send({ from: addresses.manager, gas: '1000000' });

            addresses.partner.factory = Factory.contract.options.address;

            let isValid = await Community.contract.methods.isValidFactory(addresses.partner.factory).call();

            assert(isValid);

            await Community.contract.methods.disableFactory(addresses.partner.factory).send({ from: addresses.manager, gas: '1000000' });

            isValid = await Community.contract.methods.isValidFactory(addresses.partner.factory).call();

            assert(!isValid);

            let factories = await Community.contract.methods.getFactoryAddressesOfPartner(addresses.partner.wallet).call();

            let promises = [];

            for (var i = 0; i < factories.length; i++) {
                promises.push(await Community.contract.methods.isValidFactory(factories[i]).call());

            }

            let isValidArray = await Promise.all(promises);

            for (var i = 0; i < isValidArray.length; i++) {
                assert(!isValidArray[i]);
            }
        });
    });

    describe('UCT', () => {
        it('Deploy', async () => {
            UCT.contract = await new web3.eth.Contract(UCT.interface)
            .deploy({ data: UCT.bytecode, arguments: [addresses.student.wallet] })
            .send({ from: addresses.manager, gas: UCT.gasEstimate });

            assert.ok(UCT.contract.options.address);
        });
    });

    describe('Community <> Factory <> Solution <> UCT', () => {
        before(async () => {
            Community.contract = await new web3.eth.Contract(Community.interface)
            .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
            .send({ from: addresses.manager, gas: Community.gasEstimate });

            addresses.community = Community.contract.options.address;
            addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

            Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);

            //Add partner
            await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: '1000000' });
            await Community.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });
            await Community.contract.methods.voteInApplication(0, true).send({ from: addresses.manager, gas: '1000000' });
            await Community.contract.methods.closeApplication(0).send({ from: addresses.manager, gas: '1000000' });

            // Add factory
            Factory.contract = await new web3.eth.Contract(Factory.interface)
            .deploy({ data: Factory.bytecode, arguments: [addresses.partner.wallet, addresses.community, 10] })
            .send({ from: addresses.manager, gas: Factory.gasEstimate });

            // Add skills
            await Community.contract.methods.createRequest("Solidity").send({ from: addresses.partner.wallet, gas: '2000000' });
            await Community.contract.methods.voteInRequest(0, true).send({ from: addresses.partner.wallet, gas: '1000000' });
            await Community.contract.methods.voteInRequest(0, true).send({ from: addresses.manager, gas: '1000000' });
            await Community.contract.methods.closeRequest(0).send({ from: addresses.manager, gas: '1000000' });

            addresses.partner.factory = Factory.contract.options.address;

            await Community.contract.methods.addFactoryToPartner(addresses.partner.factory, addresses.partner.wallet).send({ from: addresses.manager, gas: '1000000' });

            // Add student
            await Community.contract.methods.addWalletToCommunity(addresses.student.wallet).send({ from: addresses.manager, gas: '4000000' });
            addresses.student.uct = await Community.contract.methods.getUCTFromWallet(addresses.student.wallet).call({ from: addresses.manager });
            UCT.contract = await new web3.eth.Contract(UCT.interface, addresses.student.uct);

            // Add rater
            await Community.contract.methods.addWalletToCommunity(addresses.rater.wallet).send({ from: addresses.manager, gas: '4000000' });
            addresses.rater.uct = await Community.contract.methods.getUCTFromWallet(addresses.rater.wallet).call({ from: addresses.manager });
            UCTRater.contract = await new web3.eth.Contract(UCT.interface, addresses.rater.uct);
        });

        it('Check Factory', async () => {
            let isValidFactory = await Community.contract.methods.isValidFactory(addresses.partner.factory).call();
            assert(isValidFactory);
        });

        it('Check UCT Student', async () => {
            let uct = await Community.contract.methods.getUCTFromWallet(addresses.student.wallet).call({ from: addresses.manager });

            assert.equal(uct, addresses.student.uct);

            let isValidUct = await Community.contract.methods.isUCTInCommunity(addresses.student.uct).call();

            assert(isValidUct);
        });

        it('Check UCT Rater', async () => {
            let uct = await Community.contract.methods.getUCTFromWallet(addresses.student.wallet).call({ from: addresses.manager });

            assert.equal(uct, addresses.student.uct);

            let isValidUct = await Community.contract.methods.isUCTInCommunity(addresses.student.uct).call();

            assert(isValidUct);
        });

        it('Check Skill', async () => {
            let isValidSkill = Community.contract.methods.isApprovedSkill(web3.utils.fromAscii('Solidity', 32)).call();

            assert(isValidSkill);
        });

        it('Deploy a new solution', async () => {
            let skills = [web3.utils.fromAscii('ethereum', 32), web3.utils.fromAscii('Solidity', 32)];

            await Factory.contract.methods.deployNewSolution(skills, addresses.student.uct, 10).send({ from: addresses.partner.wallet, gas: '4000000' });
            addresses.solution = await Factory.contract.methods.getSolution(0).call({ from: addresses.manager });

            assert.ok(addresses.solution);

            Solution.contract = await new web3.eth.Contract(Solution.interface, addresses.solution);

            assert.ok(Solution.contract);

            let isValidSolution = Factory.contract.methods.isOwnerSolution(addresses.solution).call({ from: addresses.manager });
            assert(isValidSolution);
        });

        it('Add rating to solution', async () => {
            let skills = [web3.utils.fromAscii('ethereum', 32), web3.utils.fromAscii('Solidity', 32)];
            let valorations = [8, 10];

            let totalRatings = await Solution.contract.methods.totalRatings().call();
            assert.equal(totalRatings, 0);

            await Solution.contract.methods.addRating(addresses.rater.uct, skills, valorations).send({ from: addresses.manager, gas: '1000000' });

            totalRatings = await Solution.contract.methods.totalRatings().call();
            assert.equal(totalRatings, 1);
        });

        it('Can finish solution', async () => {
            let isReadyToClose = await Factory.contract.methods.isReadySolutionToClose(Solution.contract.options.address).call();
            let isReadyToFinish = await Solution.contract.methods.isReadyToFinish().call({ from: addresses.manager });
            let isValidSolution = await Community.contract.methods.isValidSolution(addresses.solution, addresses.partner.factory).call();

            assert(isReadyToClose);
            assert(isReadyToFinish);
            assert(isValidSolution);
        });

        it('The solution finish the reating process properly', async () => {
            await Solution.contract.methods.finishRating().send({ from: addresses.manager, gas: '5000000' });

            assert(true);
        });
    });
});