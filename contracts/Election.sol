// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract Election {
    address public admin;
    string public electionName;
    bool public votingOpen;

    struct Candidate {
        string name;
        uint256 voteCount;
    }

    Candidate[] public candidates;

    mapping(address => bool) public isRegisteredVoter;
    mapping(address => bool) public hasVoted;

    constructor(string memory _electionName, string[] memory candidateNames) {
        require(bytes(_electionName).length > 0, "Election name is required");
        require(candidateNames.length > 0, "At least one candidate is required");

        admin = msg.sender;
        electionName = _electionName;
        votingOpen = false;

        for (uint256 i = 0; i < candidateNames.length; i++) {
            require(bytes(candidateNames[i]).length > 0, "Candidate name cannot be empty");
            candidates.push(Candidate({
                name: candidateNames[i],
                voteCount: 0
            }));
        }
    }

    function registerVoter(address voter) public {
        require(msg.sender == admin, "Only admin can register voters");
        require(voter != address(0), "Invalid voter address");
        require(!isRegisteredVoter[voter], "Voter already registered");

        isRegisteredVoter[voter] = true;
    }

    function openVoting() public {
        require(msg.sender == admin, "Only admin can open voting");
        require(!votingOpen, "Voting is already open");

        votingOpen = true;
    }

    function closeVoting() public {
        require(msg.sender == admin, "Only admin can close voting");
        require(votingOpen, "Voting is already closed");

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

    function getCandidateCount() public view returns (uint256) {
        return candidates.length;
    }
}
