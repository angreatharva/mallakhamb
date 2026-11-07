/**
 * Realistic Indian names for the demo cast.
 *
 * Every first name has at least three letters: the demo password is
 * `<Firstname>@2026`, and the password rule wants eight characters.
 *
 * @module scripts/demo/names
 */

const MALE_FIRST = [
  'Aarav', 'Aditya', 'Akash', 'Aniket', 'Anirudh', 'Arjun', 'Atharv', 'Ayush',
  'Chinmay', 'Darshan', 'Devansh', 'Dhruv', 'Gaurav', 'Harsh', 'Ishaan', 'Jay',
  'Kartik', 'Kunal', 'Mihir', 'Nikhil', 'Omkar', 'Parth', 'Pranav', 'Prathamesh',
  'Rahul', 'Rohan', 'Sahil', 'Sanket', 'Shardul', 'Shlok', 'Siddharth', 'Soham',
  'Tanmay', 'Tejas', 'Utkarsh', 'Varun', 'Vedant', 'Vihaan', 'Vinay', 'Yash',
  'Abhay', 'Amey', 'Bhavesh', 'Hrishikesh', 'Kabir', 'Manas', 'Neel', 'Rudra',
  'Saurabh', 'Swapnil', 'Tushar', 'Yuvraj', 'Karan', 'Lakshya', 'Mayank', 'Ojas',
];

const FEMALE_FIRST = [
  'Aditi', 'Ananya', 'Anushka', 'Arya', 'Bhakti', 'Diya', 'Gauri', 'Isha',
  'Ishita', 'Janhavi', 'Kavya', 'Ketaki', 'Khushi', 'Madhura', 'Mansi', 'Mrunal',
  'Neha', 'Nidhi', 'Pooja', 'Prachi', 'Pranjal', 'Radhika', 'Riya', 'Sakshi',
  'Samruddhi', 'Sanika', 'Sayali', 'Shravani', 'Shreya', 'Siddhi', 'Sneha', 'Tanvi',
  'Tejaswini', 'Vaishnavi', 'Vedika', 'Aaradhya', 'Aishwarya', 'Avni', 'Bhumika',
  'Devika', 'Esha', 'Harshada', 'Juhi', 'Kirti', 'Mitali', 'Nandini', 'Prerna',
  'Rutuja', 'Saee', 'Swara', 'Tanaya', 'Urvi', 'Yashvi', 'Zoya', 'Payal', 'Rashmi',
];

/** Surnames, loosely grouped by the state a family is likely to be from. */
const SURNAMES = {
  Maharashtra: ['Patil', 'Jadhav', 'Pawar', 'Shinde', 'Kulkarni', 'Deshmukh', 'Joshi',
    'Gaikwad', 'Bhosale', 'More', 'Chavan', 'Kale', 'Salunkhe', 'Sawant', 'Mane',
    'Deshpande', 'Gokhale', 'Phadke', 'Karande', 'Nikam', 'Wagh', 'Thakare', 'Mhatre'],
  'Madhya Pradesh': ['Chouhan', 'Tiwari', 'Dubey', 'Mishra', 'Rathore', 'Parmar',
    'Tomar', 'Shukla', 'Raghuwanshi', 'Patidar', 'Bhadoria', 'Solanki'],
  Gujarat: ['Patel', 'Shah', 'Desai', 'Mehta', 'Parikh', 'Trivedi', 'Vyas', 'Chauhan',
    'Joshi', 'Pandya'],
  Karnataka: ['Gowda', 'Hegde', 'Shetty', 'Rao', 'Kamath', 'Bhat', 'Naik', 'Kulkarni',
    'Patil', 'Shenoy'],
  'Tamil Nadu': ['Iyer', 'Subramanian', 'Krishnan', 'Raman', 'Venkatesh', 'Natarajan',
    'Srinivasan', 'Murugan', 'Balaji', 'Sundaram'],
  Delhi: ['Sharma', 'Verma', 'Gupta', 'Malhotra', 'Kapoor', 'Arora', 'Bansal', 'Khanna',
    'Sethi', 'Chopra'],
  Chhattisgarh: ['Sahu', 'Verma', 'Yadav', 'Sinha', 'Dewangan', 'Chandrakar', 'Tandon',
    'Agrawal', 'Thakur'],
  Rajasthan: ['Rathore', 'Shekhawat', 'Choudhary', 'Meena', 'Rajput', 'Jain', 'Saini',
    'Bishnoi', 'Purohit'],
};

module.exports = { MALE_FIRST, FEMALE_FIRST, SURNAMES };
