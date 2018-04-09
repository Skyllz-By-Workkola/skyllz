require('events').EventEmitter.prototype._maxListeners = 100;

const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const web3 = new Web3(ganache.provider());

const CommunityJson = require('../ethereum/build/Community.json');
const VotingTokenJson = require('../ethereum/build/CommunityVotingToken.json');
const FactorySolution = require('../ethereum/build/Factory.json');


let Community = {
    interface: JSON.parse(CommunityJson.interface),
    bytecode: CommunityJson.bytecode,
    gasEstimate: '6000000'
};

let Voting = {
    interface: JSON.parse(VotingTokenJson.interface),
    bytecode: VotingTokenJson.bytecode,
    gasEstimate: '2000000'
}

let Factory = {
    interface: JSON.parse(FactorySolution.interface),
    bytecode: FactorySolution.bytecode,
    gasEstimate: '2000000'
};

let addresses = {
    manager: '',
    community: '',
    votingToken: '',
    partner: { wallet: '', factory: '' },
    student: { wallet: '', uct: '' },
    rater: { wallet: '' }
};

let staticCommunity = {
    contract: '',
    address: '',
    votingToken: {
        address: '',
        contract: ''
    }
};

beforeEach(async () => {
    let accounts = await web3.eth.getAccounts();

    addresses.manager = accounts[0];
    addresses.partner.wallet = accounts[1];
    addresses.student.wallet = accounts[2];
    addresses.rater.wallet = accounts[3];

    Community.contract = await new web3.eth.Contract(Community.interface)
    .deploy({ data: Community.bytecode, arguments: ["Skyllz", "Skyllz Voting Token", "SVT"] })
    .send({ from: addresses.manager, gas: Community.gasEstimate });

    addresses.community = Community.contract.options.address;
    addresses.votingToken = await Community.contract.methods.voteTokenAddress().call();

    Voting.contract = await new web3.eth.Contract(Voting.interface, addresses.votingToken);

    Factory.contract = await new web3.eth.Contract(Factory.interface)
    .deploy({ data: Factory.bytecode, arguments: [addresses.partner.wallet, addresses.manager, 10] })
    .send({ from: addresses.manager, gas: Factory.gasEstimate });
});

describe('Community contract', () => {
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

    it('Only actived partners can vote in application', async () => {
        staticCommunity = {
            contract: Community.contract,
            address: addresses.community,
            votingToken: {
                address: addresses.votingToken,
                contract: Voting.contract
            }
        };

        await staticCommunity.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: '1000000' });
        await staticCommunity.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });

        try {
            await staticCommunity.contract.methods.voteInApplication(0, true).send({ from: addresses.partner.wallet, gas: '1000000' });
            assert(false);
        } catch (e) {
            assert(true);
        }

        let application = await staticCommunity.contract.methods.applications(0).call();

        assert.equal(application.applicant, addresses.partner.wallet);
        assert.equal(application.totalVotes, 0);

        await staticCommunity.contract.methods.voteInApplication(0, true).send({ from: addresses.manager, gas: '1000000' });

        application = await staticCommunity.contract.methods.applications(0).call();

        assert.equal(application.totalVotes, 1);
        assert.equal(application.votes, 1);
    });

    it('The application close properly (Good)', async () => {
        await staticCommunity.contract.methods.closeApplication(0).send({ from: addresses.manager, gas: '1000000' });

        let isPartner = await staticCommunity.contract.methods.isPartner(addresses.partner.wallet);
        let balance = await staticCommunity.votingToken.contract.methods.balanceOf(addresses.partner.wallet).call();

        assert(isPartner);
        assert(balance == 1);
    });

    it('A partner can open a request for a new skill', async () => {
        let balance = await staticCommunity.votingToken.contract.methods.balanceOf(addresses.partner.wallet).call();

        try {
            await staticCommunity.contract.methods.createRequest("Solidity").send({ from: addresses.student.wallet, gas: '1000000' });
            assert(false);
        } catch (e) {
            assert(true);
        }

        try {
            await staticCommunity.contract.methods.createRequest("Solidity").send({ from: addresses.partner.wallet, gas: '2000000' });
            assert(true);
        } catch (e) {
            assert(false);
        }

        try {
            let request = await staticCommunity.contract.methods.requests(0).call();
            assert.ok(request);
        } catch (e) {
            assert(false);
        }

        let skills = await staticCommunity.contract.methods.getApprovedSkills().call();
        assert.equal(skills.length, 0);
    });

    it('Only partners can vote for request', async () => {
        try {
            let request = await staticCommunity.contract.methods.requests(0).call();
            assert.ok(request);
            assert(!request.isComplete);
        } catch (e) {
            assert(false);
        }

        try {
            await staticCommunity.contract.methods.voteInRequest(0, true).send({ from: addresses.student.wallet, gas: '1000000' });
            assert(false);
        } catch (e) {
            assert(true);
        }

        try {
            await staticCommunity.contract.methods.voteInRequest(0, true).send({ from: addresses.partner.wallet, gas: '1000000' });
            await staticCommunity.contract.methods.voteInRequest(0, true).send({ from: addresses.manager, gas: '1000000' });
            assert(true);
        } catch (e) {
            assert(false);
        }
    });

    it('A request can close properly', async () => {
        await staticCommunity.contract.methods.closeRequest(0).send({ from: addresses.manager, gas: '1000000' });

        let skills = await staticCommunity.contract.methods.getApprovedSkills().call();
        assert.equal(skills.length, 1);
    });

    it('Can recovery the skill name of a approved skill', async () => {
        let skills = await staticCommunity.contract.methods.getApprovedSkills().call();
        let skillName = web3.utils.toAscii(skills[0]).replace(/[\0]+/, ''); // Remove the null characteres in string

        assert.equal(skillName, 'Solidity');
    });

    it('Delete a skill propperly', async () => {
        await staticCommunity.contract.methods.createDeleteRequest('Solidity').send({ from: addresses.partner.wallet, gas: '1000000' });

        let request = await staticCommunity.contract.methods.requests(1).call();

        assert.equal(request.skillName, 'Solidity');
        assert(request.isDelete);
        assert(!request.isComplete);

        await staticCommunity.contract.methods.voteInRequest(1, true).send({ from: addresses.partner.wallet, gas: '1000000' });
        await staticCommunity.contract.methods.voteInRequest(1, true).send({ from: addresses.manager, gas: '1000000' });

        let skills = await staticCommunity.contract.methods.getApprovedSkills().call();
        let nonDeleteSkillLenght = skills.length;

        await staticCommunity.contract.methods.closeRequest(1).send({ from: addresses.manager, gas: '1000000' });

        skills = await staticCommunity.contract.methods.getApprovedSkills().call();
        assert.equal(skills.length, nonDeleteSkillLenght - 1);
    });

    it('Delete a partner properly', async () => {
        await staticCommunity.contract.methods.createDeleteApplication(addresses.partner.wallet).send({ from: addresses.partner.wallet, gas: '1000000' });

        await staticCommunity.contract.methods.enableApplication(1).send({ from: addresses.manager, gas: '1000000' });

        await staticCommunity.contract.methods.voteInApplication(1, true).send({ from: addresses.partner.wallet, gas: '1000000' });
        await staticCommunity.contract.methods.voteInApplication(1, true).send({ from: addresses.manager, gas: '1000000' });

        await staticCommunity.contract.methods.closeApplication(1).send({ from: addresses.manager, gas: '1000000' });

        let isPartner = await staticCommunity.contract.methods.isPartner(addresses.partner.wallet).call();
        let balance = await staticCommunity.votingToken.contract.methods.balanceOf(addresses.partner.wallet).call();

        assert(!isPartner);
        assert.equal(balance, 0);
    });

    it('The application close properly (Bad)', async () => {
        await Community.contract.methods.createApplication().send({ from: addresses.partner.wallet, gas: '1000000' });

        await Community.contract.methods.enableApplication(0).send({ from: addresses.manager, gas: '1000000' });

        await Community.contract.methods.voteInApplication(0, false).send({ from: addresses.manager, gas: '1000000' });

        await Community.contract.methods.closeApplication(0).send({ from: addresses.manager, gas: '1000000' });

        let application = await Community.contract.methods.applications(0).call();
        let isPartner = await Community.contract.methods.isPartner(addresses.partner.wallet).call();
        let balance = await Voting.contract.methods.balanceOf(addresses.partner.wallet).call();

        assert(!application.isActive);
        assert(application.isComplete);
        assert(!isPartner);
        assert.equal(balance, 0);
    });

    it('Deploy a new factory', () => {
        assert.ok(Factory.contract.options.address);
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