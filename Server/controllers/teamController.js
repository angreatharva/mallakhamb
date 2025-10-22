const Team = require('../models/Team');
const Player = require('../models/Player');

// Get all teams
const getAllTeams = async (req, res) => {
  try {
    const teams = await Team.find({ isActive: true })
      .populate('coach', 'name email')
      .select('name description');

    res.json({ teams });
  } catch (error) {
    console.error('Get all teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get team by ID
const getTeamById = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id)
      .populate('coach', 'name email')
      .populate('players.player', 'firstName lastName aadharNumber dateOfBirth gender');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    res.json({ team });
  } catch (error) {
    console.error('Get team by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update team
const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if coach owns this team
    if (team.coach.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if new name already exists (if name is being changed)
    if (name && name !== team.name) {
      const existingTeam = await Team.findOne({ name, _id: { $ne: id } });
      if (existingTeam) {
        return res.status(400).json({ message: 'Team name already exists' });
      }
    }

    team.name = name || team.name;
    team.description = description || team.description;
    await team.save();

    res.json({ message: 'Team updated successfully', team });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete team
const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if coach owns this team
    if (team.coach.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Remove team reference from all players
    await Player.updateMany(
      { team: id },
      { $unset: { team: 1 } }
    );

    // Remove team reference from coach
    await Coach.findByIdAndUpdate(team.coach, { $unset: { team: 1 } });

    // Delete team
    await Team.findByIdAndDelete(id);

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get team statistics
const getTeamStats = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id)
      .populate('players.player', 'gender dateOfBirth');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Calculate statistics
    const stats = {
      totalPlayers: team.players.length,
      byGender: {
        male: 0,
        female: 0
      },
      byAgeGroup: {
        U10: 0,
        U12: 0,
        U14: 0,
        U16: 0,
        U18: 0,
        Above18: 0,
        Above16: 0
      }
    };

    team.players.forEach(player => {
      // Count by gender
      if (player.gender === 'Male') stats.byGender.male++;
      if (player.gender === 'Female') stats.byGender.female++;

      // Count by age group
      if (stats.byAgeGroup[player.ageGroup] !== undefined) {
        stats.byAgeGroup[player.ageGroup]++;
      }
    });

    res.json({ stats });
  } catch (error) {
    console.error('Get team stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  getTeamStats
};
