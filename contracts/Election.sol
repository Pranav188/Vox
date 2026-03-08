// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract Election {
    address public admin; // wallet that deployed the election
    string public electionName; // title of election
    bool public votingOpen;

    struct Candidate {
        string name;
        uint256 voteCount;
    }

    Candidate[] public candidates; // array of candidates

    mapping(address => bool) public isRegisteredVoter;
    mapping(address => bool) public hasVoted;

    constructor(string memory _electionName, string[] memory candidateNames) {
        admin = msg.sender; // address of the deployer
        electionName = _electionName;
        votingOpen = false;

        for (uint256 i = 0; i < candidateNames.length; i++) {
            candidates.push(Candidate({
                name: candidateNames[i],
                voteCount: 0
            }));
        }
    }

    function registerVoter(address voter) public {
    require(msg.sender == admin, "Only admin can register voters");
    isRegisteredVoter[voter] = true;
    }

    function openVoting() public {
    require(msg.sender == admin, "Only admin can open voting");
    votingOpen = true;
    }

    function closeVoting() public {
    require(msg.sender == admin, "Only admin can close voting");
    votingOpen = false;
    }

    function vote(uint256 candidateIndex) public {
    require(votingOpen, "Voting is closed");
    require(isRegisteredVoter[msg.sender], "You are not a registered voter");
    require(!hasVoted[msg.sender], "You have already voted");
    require(candidateIndex < candidates.length, "Invalid candidate index");

    candidates[candidateIndex].voteCount += 1;
    hasVoted[msg.sender] = true;
    }


    // msg.sender is the wallet address that is calling a function, in this case the voter calling func vote

    function getCandidateCount() public view returns (uint256) {
        return candidates.length;
    }
}



